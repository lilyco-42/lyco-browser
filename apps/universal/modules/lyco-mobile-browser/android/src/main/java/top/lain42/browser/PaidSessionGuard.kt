package top.lain42.browser

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/** Native-only in-memory Billing lease; web pages cannot call this verifier. */
class PaidSessionGuard(
  private val token: String,
  private val owner: String,
  initialDeadline: Long,
  private val onRevoked: () -> Unit
) {
  private val handler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private var closed = false
  private var deadline = minOf(initialDeadline, System.currentTimeMillis() + 300000)
  private val expire = Runnable { if (!closed) revoke() }
  private val poll = Runnable { if (!closed) verify() }

  fun start() { checkForeground(); if (!closed) { armExpiry(); handler.postDelayed(poll, 60000) } }
  fun checkForeground() { if (!closed && System.currentTimeMillis() >= deadline) revoke() }
  fun close() {
    closed = true
    handler.removeCallbacksAndMessages(null)
    executor.shutdownNow()
  }
  private fun revoke() { close(); onRevoked() }
  private fun armExpiry() {
    handler.removeCallbacks(expire)
    handler.postDelayed(expire, (deadline - System.currentTimeMillis()).coerceAtLeast(0))
  }
  private fun verify() {
    executor.execute {
      var connection: HttpsURLConnection? = null
      var revoked = false
      var verifiedUntil: Long? = null
      try {
        connection = URL("https://lain42.top/studio/api/me").openConnection() as HttpsURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 15000; connection.readTimeout = 15000
        connection.useCaches = false
        connection.setRequestProperty("Authorization", "Bearer $token")
        val status = connection.responseCode
        if (status == 401 || status == 403) revoked = true
        else if (status == 200) {
          val bytes = connection.inputStream.use { input ->
            val buffer = java.io.ByteArrayOutputStream()
            val block = ByteArray(8192)
            while (true) {
              val count = input.read(block); if (count < 0) break
              check(buffer.size() + count <= 2000000) { "Oversized Billing response" }
              buffer.write(block, 0, count)
            }
            buffer.toByteArray()
          }
          val account = JSONObject(String(bytes, Charsets.UTF_8))
          val now = System.currentTimeMillis()
          var expiry: Long? = null
          var active = false
          val entitlements = account.optJSONArray("entitlements")
          if (account.optString("username") == owner && entitlements != null) {
            for (index in 0 until entitlements.length()) {
              val item = entitlements.optJSONObject(index) ?: continue
              if (item.optString("product") != "proxy_1m" || item.optString("status") != "active") continue
              val sub = item.optJSONObject("meta")?.optString("sub_url") ?: ""
              if (!sub.matches(Regex("https://lain42\\.top/panel/api/sub/[A-Za-z0-9_-]{6,128}"))) continue
              val value = item.optString("expires_at", "")
              val parsed = if (value.isBlank() || value == "null") null else try { Instant.parse(value).toEpochMilli() } catch (_: Exception) { continue }
              if (parsed != null && parsed <= now) continue
              active = true; expiry = parsed; break
            }
          }
          revoked = !active
          if (active) verifiedUntil = minOf(now + 300000, expiry ?: Long.MAX_VALUE)
        }
      } catch (_: Exception) { /* Keep only the existing bounded verification lease. */ }
      finally { connection?.disconnect() }
      handler.post {
        if (!closed) {
          if (revoked) revoke()
          else {
            verifiedUntil?.let { deadline = it; armExpiry() }
            checkForeground()
            if (!closed) handler.postDelayed(poll, 60000)
          }
        }
      }
    }
  }
}
