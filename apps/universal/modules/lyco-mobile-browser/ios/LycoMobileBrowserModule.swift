import ExpoModulesCore
import WebKit
import Network
import UIKit
import Lycotunnel

public class LycoMobileBrowserModule: Module {
  private weak var active: ProfileBrowserController?

  public func definition() -> ModuleDefinition {
    Name("LycoMobileBrowser")
    AsyncFunction("open") { (options: [String: String]) in
      guard #available(iOS 17.0, *) else { throw BrowserError("独立环境需要 iOS 17 或更新版本") }
      guard self.active == nil else { throw BrowserError("请先关闭当前环境") }
      guard let presenter = self.appContext?.utilities?.currentViewController(), presenter.presentedViewController == nil else {
        throw BrowserError("暂时无法打开环境，请关闭当前弹窗")
      }
      let controller = try ProfileBrowserController(options: options)
      controller.modalPresentationStyle = .fullScreen
      self.active = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)
    AsyncFunction("closeAll") { (promise: Promise) in
      guard let controller = self.active else { promise.resolve(); return }
      controller.shutdown { self.active = nil; promise.resolve() }
    }.runOnQueue(.main)
    AsyncFunction("clearProfile") { (id: String, promise: Promise) in
      guard #available(iOS 17.0, *), let identifier = UUID(uuidString: id), self.active == nil else {
        promise.reject(BrowserError("请先关闭当前环境，再清除网站数据")); return
      }
      WKWebsiteDataStore.remove(forIdentifier: identifier) { error in
        if error != nil { promise.reject(BrowserError("无法清除网站数据，环境条目已保留")) }
        else { promise.resolve() }
      }
    }.runOnQueue(.main)
  }
}

private struct BrowserError: Error, LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

@available(iOS 17.0, *)
private final class ProfileBrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate, UITextFieldDelegate {
  private var tunnel: LycotunnelSession?
  private var paidGuard: PaidSessionGuard?
  private var stopped = false
  private var browser: WKWebView?
  private let startURL: URL
  private let configuration: WKWebViewConfiguration
  private let environmentName: String
  private let status = UILabel()
  private let address = UITextField()
  private let back = UIButton(type: .system)
  private let forward = UIButton(type: .system)
  private let reload = UIButton(type: .system)

  init(options: [String: String]) throws {
    guard let id = UUID(uuidString: options["id"] ?? ""),
      let url = URL(string: options["url"] ?? ""), Self.allowed(url) else {
      throw BrowserError("环境或网址设置无效")
    }
    let host: String
    let portValue: UInt16
    var core: LycotunnelSession?
    var paidToken: String?
    var paidOwner: String?
    var verificationDeadline: Date?
    if let outbound = options["outbound"] {
      guard let token = options["accountToken"], !token.isEmpty, token.count <= 4096,
        !token.contains("\r"), !token.contains("\n"),
        let owner = options["accountOwner"], !owner.isEmpty, owner.count <= 120,
        let value = Double(options["verificationDeadline"] ?? ""), value.isFinite,
        Date(timeIntervalSince1970: value / 1000) > Date() else { throw BrowserError("请重新核实官网权益") }
      var failure: NSError?
      guard let session = LycotunnelStart(outbound, true, &failure) else { throw BrowserError("无法准备官网线路，请刷新订阅或更新客户端") }
      core = session
      host = "127.0.0.1"; portValue = UInt16(session.port())
      paidToken = token; paidOwner = owner; verificationDeadline = Date(timeIntervalSince1970: value / 1000)
    } else {
      guard let address = options["host"], address.range(of: "^[A-Za-z0-9.-]{1,253}$", options: .regularExpression) != nil,
        let value = UInt16(options["port"] ?? ""), value > 0,
        let protocolName = options["scheme"], ["http", "https"].contains(protocolName) else { throw BrowserError("HTTP(S) 代理设置无效") }
      var node: [String: Any] = ["type": "http", "server": address, "server_port": Int(value)]
      if protocolName == "https" { node["tls"] = ["enabled": true, "server_name": address] }
      guard let data = try? JSONSerialization.data(withJSONObject: node), let content = String(data: data, encoding: .utf8) else { throw BrowserError("代理设置无效") }
      var failure: NSError?
      guard let session = LycotunnelStart(content, true, &failure) else { throw BrowserError("无法准备自备代理，请检查地址或更新客户端") }
      core = session
      host = "127.0.0.1"; portValue = UInt16(session.port())
    }
    guard let port = NWEndpoint.Port(rawValue: portValue) else { try? core?.close(); throw BrowserError("代理端口无效") }
    startURL = url
    environmentName = String((options["name"] ?? "独立环境").prefix(90))
    let store = WKWebsiteDataStore(forIdentifier: id)
    // The source-built mixed listener accepts authenticated SOCKS5 as well as
    // HTTP. Use the public transport-level SOCKS5 configuration for every web
    // destination. The previous HTTP path failed the local negative control;
    // the unchanged native acceptance must verify this transport as well.
    // The remote HTTP(S) or subscription outbound still belongs to the core.
    var proxy = ProxyConfiguration(socksv5Proxy: .hostPort(host: .init(host), port: port))
    proxy.allowFailover = false
    if let core { proxy.applyCredential(username: core.username(), password: core.password()) }
    store.proxyConfigurations = [proxy]
    let config = WKWebViewConfiguration()
    config.websiteDataStore = store
    config.preferences.javaScriptCanOpenWindowsAutomatically = false
    config.mediaTypesRequiringUserActionForPlayback = .all
    configuration = config
    tunnel = core
    super.init(nibName: nil, bundle: nil)
    if let token = paidToken, let owner = paidOwner, let deadline = verificationDeadline {
      paidGuard = PaidSessionGuard(token: token, owner: owner, deadline: deadline) { [weak self] in self?.stopForAuthorization() }
    }
    NotificationCenter.default.addObserver(self, selector: #selector(checkPaidLease), name: UIApplication.didBecomeActiveNotification, object: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let close = UIButton(type: .system)
    close.setTitle("关闭环境", for: .normal)
    close.setContentCompressionResistancePriority(.required, for: .horizontal)
    close.addTarget(self, action: #selector(closeEnvironment), for: .touchUpInside)
    status.text = environmentName + " · 已配置代理"
    status.font = .preferredFont(forTextStyle: .caption1)
    status.numberOfLines = 2
    status.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    let bar = UIStackView(arrangedSubviews: [close, status])
    bar.axis = .horizontal
    bar.spacing = 12
    address.accessibilityLabel = "浏览网址"
    address.placeholder = "输入网址"
    address.borderStyle = .roundedRect
    address.clearButtonMode = .whileEditing
    address.keyboardType = .URL
    address.autocapitalizationType = .none
    address.autocorrectionType = .no
    address.returnKeyType = .go
    address.delegate = self
    address.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    let go = UIButton(type: .system)
    go.setTitle("前往", for: .normal)
    go.addTarget(self, action: #selector(navigateAddress), for: .touchUpInside)
    let addressBar = UIStackView(arrangedSubviews: [address, go])
    addressBar.spacing = 8
    go.setContentHuggingPriority(.required, for: .horizontal)
    go.setContentCompressionResistancePriority(.required, for: .horizontal)
    go.widthAnchor.constraint(greaterThanOrEqualToConstant: 56).isActive = true
    back.setTitle("后退", for: .normal)
    forward.setTitle("前进", for: .normal)
    reload.setTitle("刷新", for: .normal)
    back.addTarget(self, action: #selector(goBack), for: .touchUpInside)
    forward.addTarget(self, action: #selector(goForward), for: .touchUpInside)
    reload.addTarget(self, action: #selector(reloadPage), for: .touchUpInside)
    let navigationBar = UIStackView(arrangedSubviews: [back, forward, reload])
    navigationBar.distribution = .fillEqually
    let web = WKWebView(frame: .zero, configuration: configuration)
    web.navigationDelegate = self
    web.uiDelegate = self
    browser = web
    let stack = UIStackView(arrangedSubviews: [bar, addressBar, navigationBar, web])
    stack.axis = .vertical
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      bar.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
      addressBar.heightAnchor.constraint(equalToConstant: 44),
      navigationBar.heightAnchor.constraint(equalToConstant: 44)
    ])
    address.text = startURL.absoluteString
    updateNavigation()
    paidGuard?.start()
    if !stopped { web.load(URLRequest(url: startURL)) }
  }
  @objc private func checkPaidLease() { paidGuard?.checkForeground() }
  func textFieldShouldReturn(_ textField: UITextField) -> Bool { navigateAddress(); return true }
  func textFieldDidBeginEditing(_ textField: UITextField) {
    DispatchQueue.main.async { [weak textField] in
      guard let textField, textField.isFirstResponder else { return }
      textField.selectedTextRange = textField.textRange(from: textField.beginningOfDocument, to: textField.endOfDocument)
    }
  }
  @objc private func navigateAddress() {
    guard !stopped, let browser else { return }
    let raw = (address.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let hasScheme = raw.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) != nil
    address.resignFirstResponder()
    guard let url = URL(string: hasScheme ? raw : "https://" + raw), Self.allowed(url) else {
      status.text = "请输入无账号密码的 HTTP(S) 网址"; return
    }
    browser.load(URLRequest(url: url))
  }
  @objc private func goBack() { if !stopped, browser?.canGoBack == true { browser?.goBack() } }
  @objc private func goForward() { if !stopped, browser?.canGoForward == true { browser?.goForward() } }
  @objc private func reloadPage() { if !stopped { browser?.reload() } }
  private func updateNavigation() {
    back.isEnabled = !stopped && browser?.canGoBack == true
    forward.isEnabled = !stopped && browser?.canGoForward == true
    reload.isEnabled = !stopped && browser != nil
  }
  private func stopForAuthorization() {
    stopped = true
    paidGuard?.close(); paidGuard = nil
    try? tunnel?.close(); tunnel = nil
    browser?.stopLoading(); browser?.removeFromSuperview(); browser = nil
    updateNavigation()
    status.text = "官网权益已失效或长时间无法核实，环境已停止"
  }
  deinit { paidGuard?.close(); try? tunnel?.close(); NotificationCenter.default.removeObserver(self) }
  fileprivate func shutdown(completion: @escaping () -> Void) { finishClose(completion: completion) }
  @objc private func closeEnvironment() { finishClose(completion: {}) }
  private func finishClose(completion: @escaping () -> Void) {
    stopped = true
    paidGuard?.close(); paidGuard = nil
    try? tunnel?.close(); tunnel = nil
    browser?.stopLoading()
    browser?.navigationDelegate = nil
    browser?.removeFromSuperview()
    browser = nil
    updateNavigation()
    // Keep proxy settings on the data store: existing service workers must
    // never become direct when the visible view closes.
    if presentingViewController != nil { dismiss(animated: true, completion: completion) }
    else { completion() }
  }
  private static func allowed(_ url: URL) -> Bool {
    ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil && url.password == nil
  }
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    decisionHandler(action.request.url.map(Self.allowed) == true ? .allow : .cancel)
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    showNavigationFailure(error)
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    showNavigationFailure(error)
  }
  private func showNavigationFailure(_ error: Error) {
    status.text = "连接失败（\((error as NSError).code)），请检查所选代理"
    updateNavigation()
  }
  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    status.text = "正在通过所选代理加载…"
    if !address.isFirstResponder { address.text = webView.url?.absoluteString }
    updateNavigation()
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    status.text = environmentName + " · 已配置代理 · " + (webView.url?.host ?? "")
    if !address.isFirstResponder { address.text = webView.url?.absoluteString }
    updateNavigation()
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { status.text = "环境进程已停止，请关闭后重新打开" }
}
