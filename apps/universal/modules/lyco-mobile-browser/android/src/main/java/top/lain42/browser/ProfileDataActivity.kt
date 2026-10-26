package top.lain42.browser

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.ResultReceiver
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.TextView
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebStorageCompat
import androidx.webkit.WebViewFeature
import java.util.UUID
import java.net.ServerSocket
import java.net.InetAddress

/** Website-data deletion runs in the same isolated directory as that profile. */
class ProfileDataActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var receiver: ResultReceiver? = null
  private var completed = false
  private var blockedProxy: ServerSocket? = null

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    @Suppress("DEPRECATION")
    receiver = intent.getParcelableExtra("result")
    setContentView(TextView(this).apply { text = "正在清除所选环境的网站数据…"; setPadding(24, 72, 24, 24) })
    handler.postDelayed({ complete("清除超时，环境条目已保留，请更新系统 WebView 后重试") }, 20000)
    try {
      val id = UUID.fromString(intent.getStringExtra("id")).toString()
      WebView.setDataDirectorySuffix("lyco_$id")
      check(WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE) && WebViewFeature.isFeatureSupported(WebViewFeature.DELETE_BROWSING_DATA))
      // Never restore a direct route while old stored workers are being removed.
      val blocked = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
      blockedProxy = blocked
      val config = ProxyConfig.Builder().addProxyRule("http://127.0.0.1:${blocked.localPort}").addBypassRule("<-loopback>").build()
      ProxyController.getInstance().setProxyOverride(config, mainExecutor) {
        if (!completed) {
          try { WebStorageCompat.deleteBrowsingData(WebStorage.getInstance()) { complete(null) } }
          catch (_: Exception) { complete("无法清除网站数据，请更新系统 WebView 后重试") }
        }
      }
    } catch (_: Exception) { complete("清除网站数据需要更新的系统 WebView；环境条目已保留") }
  }

  private fun complete(error: String?) {
    if (completed) return
    completed = true
    handler.removeCallbacksAndMessages(null)
    receiver?.send(if (error == null) RESULT_OK else RESULT_CANCELED, Bundle().apply { putString("message", error) })
    finish()
  }
  override fun onDestroy() {
    if (!completed) receiver?.send(RESULT_CANCELED, Bundle().apply { putString("message", "清除已取消，环境条目已保留") })
    handler.removeCallbacksAndMessages(null)
    runCatching { blockedProxy?.close() }
    super.onDestroy()
    Process.killProcess(Process.myPid())
  }
}
