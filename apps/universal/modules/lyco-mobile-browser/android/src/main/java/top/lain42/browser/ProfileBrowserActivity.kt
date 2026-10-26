package top.lain42.browser

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import java.util.UUID

/** One profile and one route per process lifetime. No React bridge in web content. */
class ProfileBrowserActivity : Activity() {
  private var browser: WebView? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { fail("代理设置超时，未打开网页") }
  private lateinit var status: TextView
  private var closing = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val close = Button(this).apply { text = "关闭环境"; setOnClickListener { finish() } }
    status = TextView(this).apply { text = "正在配置独立环境与代理…"; setPadding(16, 12, 16, 12) }
    layout.addView(close)
    layout.addView(status)
    setContentView(layout)
    try {
      val id = UUID.fromString(intent.getStringExtra("id")).toString()
      val url = intent.getStringExtra("url") ?: error("缺少网址")
      check(allowedUrl(url)) { "仅支持 HTTP(S) 网页" }
      val host = intent.getStringExtra("host") ?: error("缺少代理地址")
      check(host.matches(Regex("[A-Za-z0-9.-]{1,253}"))) { "代理主机无效" }
      val port = intent.getStringExtra("port")?.toIntOrNull() ?: error("代理端口无效")
      check(port in 1..65535) { "代理端口无效" }
      val scheme = intent.getStringExtra("scheme") ?: "http"
      check(scheme == "http" || scheme == "https") { "移动端当前支持 HTTP(S) 代理" }
      // Must precede ANY android.webkit/WebViewFeature call in this process.
      WebView.setDataDirectorySuffix("lyco_$id")
      check(WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) { "请更新 Android System WebView 以支持代理" }
      val config = ProxyConfig.Builder().addProxyRule("$scheme://$host:$port")
        .addBypassRule("<-loopback>").build()
      handler.postDelayed(timeout, 15000)
      // No DIRECT rule, no PAC, no system-proxy fallback. Navigation only starts
      // after the override completion callback, never while it is being applied.
      ProxyController.getInstance().setProxyOverride(config, mainExecutor) {
        handler.removeCallbacks(timeout)
        if (!closing) {
          val view = WebView(this)
          browser = view
          view.settings.javaScriptEnabled = true
          view.settings.domStorageEnabled = true
          view.settings.allowFileAccess = false
          view.settings.allowContentAccess = false
          view.settings.setSupportMultipleWindows(false)
          view.settings.javaScriptCanOpenWindowsAutomatically = false
          view.settings.mediaPlaybackRequiresUserGesture = true
          CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
          view.webChromeClient = WebChromeClient() // Permission requests are denied by default.
          view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !allowedUrl(request.url.toString())
            override fun onPageFinished(view: WebView, url: String) {
              CookieManager.getInstance().flush()
              status.text = "${intent.getStringExtra("name") ?: "独立环境"} · 已配置代理 · ${Uri.parse(url).host ?: ""}"
            }
          }
          layout.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
          status.text = "独立环境 · 已配置代理"
          view.loadUrl(url)
        }
      }
    } catch (_: Exception) { fail("无法建立独立代理环境，请检查设置并更新系统 WebView") }
  }

  // A live WebView/process must never switch directory or proxy underneath a
  // service worker. User closes the current environment before opening another.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    status.text = "请先关闭当前环境，再打开另一个环境"
  }

  private fun allowedUrl(value: String): Boolean {
    val uri = Uri.parse(value)
    return uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null
  }
  private fun fail(message: String) {
    handler.removeCallbacks(timeout)
    closing = true
    browser?.stopLoading()
    browser?.destroy()
    browser = null
    status.text = message
  }
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    val view = browser
    if (view != null && view.canGoBack()) view.goBack() else finish()
  }
  override fun onDestroy() {
    closing = true
    handler.removeCallbacksAndMessages(null)
    browser?.let { CookieManager.getInstance().flush(); it.stopLoading(); it.destroy() }
    browser = null
    super.onDestroy()
    // End workers and the process-wide proxy together. Never clear an override
    // while an old worker could fall back to the ordinary device route.
    Process.killProcess(Process.myPid())
  }
}
