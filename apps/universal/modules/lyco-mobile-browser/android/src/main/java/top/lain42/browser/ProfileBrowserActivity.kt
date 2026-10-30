package top.lain42.browser

import android.app.Activity
import android.content.Intent
import android.content.Context
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.text.InputType
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import androidx.webkit.WebViewCompat
import java.util.UUID
import org.json.JSONObject
import top.lain42.lycotunnel.Lycotunnel
import top.lain42.lycotunnel.Session

/** One profile and one route per process lifetime. No React bridge in web content. */
class ProfileBrowserActivity : Activity() {
  private var browser: WebView? = null
  private var tunnel: Session? = null
  private var paidGuard: PaidSessionGuard? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { fail("代理设置超时，未打开网页") }
  private lateinit var status: TextView
  private lateinit var address: EditText
  private lateinit var back: Button
  private lateinit var forward: Button
  private lateinit var reload: Button
  private var closing = false
  private var controlRegistered = false
  private val controlReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { if (intent.action == ProfileControl.ACTION_CLOSE) finish() }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; isFocusableInTouchMode = true }
    layout.setOnApplyWindowInsetsListener { view, insets ->
      if (Build.VERSION.SDK_INT >= 30) {
        val bars = insets.getInsets(WindowInsets.Type.systemBars())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      } else {
        @Suppress("DEPRECATION")
        view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
      }
      insets
    }
    val close = Button(this).apply { text = "关闭环境"; setOnClickListener { finish() } }
    status = TextView(this).apply { text = "正在配置独立环境与代理…"; setPadding(16, 12, 16, 12) }
    layout.addView(close)
    layout.addView(status)
    address = EditText(this).apply {
      contentDescription = "浏览网址"; hint = "输入网址"
      setSingleLine(true)
      setSelectAllOnFocus(true)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
      imeOptions = EditorInfo.IME_ACTION_GO
      setOnEditorActionListener { _, action, _ ->
        if (action == EditorInfo.IME_ACTION_GO) { navigateAddress(); true } else false
      }
    }
    val addressBar = LinearLayout(this)
    addressBar.addView(address, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    addressBar.addView(Button(this).apply { text = "前往"; setOnClickListener { navigateAddress() } })
    layout.addView(addressBar)
    val navigation = LinearLayout(this)
    back = Button(this).apply { text = "后退"; isEnabled = false; setOnClickListener { browser?.takeIf { it.canGoBack() && !closing }?.goBack() } }
    forward = Button(this).apply { text = "前进"; isEnabled = false; setOnClickListener { browser?.takeIf { it.canGoForward() && !closing }?.goForward() } }
    reload = Button(this).apply { text = "刷新"; isEnabled = false; setOnClickListener { if (!closing) browser?.reload() } }
    for (button in listOf(back, forward, reload)) navigation.addView(button, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    layout.addView(navigation)
    setContentView(layout)
    layout.requestFocus()
    try {
      val filter = IntentFilter(ProfileControl.ACTION_CLOSE)
      if (Build.VERSION.SDK_INT >= 33) registerReceiver(controlReceiver, filter, ProfileControl.PERMISSION, null, Context.RECEIVER_NOT_EXPORTED)
      else registerReceiver(controlReceiver, filter, ProfileControl.PERMISSION, null)
      controlRegistered = true
      val epoch = getSharedPreferences(ProfileControl.PREFERENCES, Context.MODE_PRIVATE).getLong(ProfileControl.EPOCH, 0)
      if (intent.getLongExtra(ProfileControl.EPOCH, -1) != epoch) { finish(); return }
      val id = UUID.fromString(intent.getStringExtra("id")).toString()
      val url = intent.getStringExtra("url") ?: error("缺少网址")
      check(allowedUrl(url)) { "仅支持 HTTP(S) 网页" }
      address.setText(url)
      val host: String
      val port: Int
      val scheme: String
      val outbound = intent.getStringExtra("outbound")
      if (outbound != null) {
        val token = intent.getStringExtra("accountToken") ?: error("缺少登录会话")
        val owner = intent.getStringExtra("accountOwner") ?: error("缺少所属账号")
        val deadline = intent.getStringExtra("verificationDeadline")?.toLongOrNull() ?: error("权益核实无效")
        check(token.isNotBlank() && token.length <= 4096 && !token.contains('\r') && !token.contains('\n') && owner.isNotBlank() && owner.length <= 120 && deadline > System.currentTimeMillis()) { "请重新核实官网权益" }
        tunnel = Lycotunnel.start(outbound, false)
        host = "127.0.0.1"; port = tunnel!!.port().toInt(); scheme = "http"
        paidGuard = PaidSessionGuard(token, owner, deadline) { fail("官网权益已失效或长时间无法核实，环境已停止") }
        // System task restoration must not retain account or node secrets.
        intent.removeExtra("accountToken"); intent.removeExtra("outbound")
      } else {
        val remoteHost = intent.getStringExtra("host") ?: error("缺少代理地址")
        check(remoteHost.matches(Regex("[A-Za-z0-9.-]{1,253}"))) { "代理主机无效" }
        val remotePort = intent.getStringExtra("port")?.toIntOrNull() ?: error("代理端口无效")
        val remoteScheme = intent.getStringExtra("scheme") ?: "http"
        check(remotePort in 1..65535 && (remoteScheme == "http" || remoteScheme == "https")) { "HTTP(S) 代理设置无效" }
        val node = JSONObject().put("type", "http").put("server", remoteHost).put("server_port", remotePort)
        if (remoteScheme == "https") node.put("tls", JSONObject().put("enabled", true).put("server_name", remoteHost))
        tunnel = Lycotunnel.start(node.toString(), false)
        host = "127.0.0.1"; port = tunnel!!.port().toInt(); scheme = "http"
      }
      check(port in 1..65535) { "代理端口无效" }
      paidGuard?.start()
      if (closing) return
      // Startup-feature inspection does not initialize the provider. Configure
      // the explicit data/cache bases and suffix before loading WebView.
      ProfileStorage.configure(this, id)
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
          view.settings.builtInZoomControls = true
          view.settings.displayZoomControls = false
          CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
          view.webChromeClient = WebChromeClient() // Permission requests are denied by default.
          check(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) { "请更新系统 WebView 以启用 RTC 线路保护" }
          val rtcPolicy = assets.open("lyco-rtc-policy.js").bufferedReader().use { it.readText() }
          WebViewCompat.addDocumentStartJavaScript(view, rtcPolicy, setOf("*"))
          view.webViewClient = object : WebViewClient() {
            private var mainError: String? = null
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !allowedUrl(request.url.toString())
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
              if (closing) return
              mainError = null
              if (!address.hasFocus()) address.setText(url)
              status.text = "正在通过所选代理加载…"
              updateNavigation()
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
              if (request.isForMainFrame && !closing) { mainError = "页面网络请求失败（${error.errorCode}）"; status.text = mainError }
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
              if (request.isForMainFrame && !closing) { mainError = "页面返回 HTTP ${response.statusCode}"; status.text = mainError }
            }
            override fun onPageFinished(view: WebView, url: String) {
              if (closing) return
              CookieManager.getInstance().flush()
              status.text = mainError ?: "${intent.getStringExtra("name") ?: "独立环境"} · 已配置代理 · ${Uri.parse(url).host ?: ""}"
              if (!address.hasFocus()) address.setText(url)
              updateNavigation()
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
  private fun navigateAddress() {
    if (closing || browser == null) return
    val raw = address.text.toString().trim()
    val url = if (Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(raw)) raw else "https://$raw"
    address.clearFocus()
    (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken, 0)
    if (!allowedUrl(url)) { status.text = "请输入无账号密码的 HTTP(S) 网址"; return }
    browser?.loadUrl(url)
  }
  private fun updateNavigation() {
    back.isEnabled = !closing && browser?.canGoBack() == true
    forward.isEnabled = !closing && browser?.canGoForward() == true
    reload.isEnabled = !closing && browser != null
  }
  private fun fail(message: String) {
    handler.removeCallbacks(timeout)
    closing = true
    paidGuard?.close(); paidGuard = null
    runCatching { tunnel?.close() }; tunnel = null
    browser?.stopLoading()
    browser?.destroy()
    browser = null
    updateNavigation()
    status.text = message
  }
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    val view = browser
    if (view != null && view.canGoBack()) view.goBack() else finish()
  }
  override fun onResume() { super.onResume(); paidGuard?.checkForeground() }
  override fun onDestroy() {
    closing = true
    if (controlRegistered) { unregisterReceiver(controlReceiver); controlRegistered = false }
    paidGuard?.close(); paidGuard = null
    runCatching { tunnel?.close() }; tunnel = null
    handler.removeCallbacksAndMessages(null)
    browser?.let { CookieManager.getInstance().flush(); it.stopLoading(); it.destroy() }
    browser = null
    super.onDestroy()
    // End workers and the process-wide proxy together. Never clear an override
    // while an old worker could fall back to the ordinary device route.
    Process.killProcess(Process.myPid())
  }
}
