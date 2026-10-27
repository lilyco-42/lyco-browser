// Actions-only investigation of the public iOS proxy API, without Expo or
// product fingerprint scripts. It never changes the product acceptance flows.
import UIKit
import WebKit
import Network
import Lycotunnel

@available(iOS 17.0, *)
@objc(ProbeDelegate)
final class ProbeDelegate: UIResponder, UIApplicationDelegate, WKNavigationDelegate {
  var window: UIWindow?
  private var web: WKWebView?
  private var core: LycotunnelSession?
  private var timeout: DispatchWorkItem?
  private var index = 0
  private var generation = 0
  private var finishedGeneration = -1
  private var row: [String: Any] = [:]
  private var results: [[String: Any]] = []
  private let modes = ["direct-control", "direct-http", "direct-http-v6", "core-http", "core-socks", "core-socks-empty", "core-socks-explicit", "core-socks-wildcard"]
  private lazy var cases: [(String, String)] = modes.flatMap { mode in
    mode == "direct-control" ? [(mode,"local")] : [(mode,"domain"),(mode,"local"),(mode,"stopped-local")]
  }
  func application(_ application: UIApplication,didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey:Any]?) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    window.rootViewController = UIViewController();window.makeKeyAndVisible();self.window = window
    DispatchQueue.main.async {self.next()};return true
  }
  private func next() {
    if index == cases.count {
      let data = try! JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted,.sortedKeys])
      let path = FileManager.default.urls(for: .documentDirectory,in: .userDomainMask)[0].appendingPathComponent("results.json")
      try! data.write(to: path,options: .atomic);return
    }
    generation += 1
    let current = generation
    let (mode,phase) = cases[index]
    let caseId = mode+"-"+phase
    row = ["case":caseId,"mode":mode,"phase":phase]
    let store = WKWebsiteDataStore(forIdentifier: UUID())
    if mode != "direct-control" {
      var port = UInt16(phase == "stopped-local" ? 1 : 18081)
      if mode.hasPrefix("core-") {
        let outbound = "{\"type\":\"http\",\"server\":\"127.0.0.1\",\"server_port\":"+String(port)+"}"
        var error: NSError?
        guard let session = LycotunnelStart(outbound,true,&error) else {finish("core-start-failed");return}
        core = session;port = UInt16(session.port())
      }
      // Different proxy and origin IPs distinguish a proxy-server-address
      // exemption from a general loopback exemption. Product gates stay intact.
      let endpoint = NWEndpoint.hostPort(host: mode == "direct-http-v6" ? "::1" : "127.0.0.1",port: NWEndpoint.Port(rawValue: port)!)
      var proxy = mode.contains("socks") ? ProxyConfiguration(socksv5Proxy: endpoint) : ProxyConfiguration(httpCONNECTProxy: endpoint,tlsOptions: nil)
      row["initialMatchCount"] = proxy.matchDomains.count;row["initialExcludedCount"] = proxy.excludedDomains.count
      if let core {proxy.applyCredential(username: core.username(),password: core.password())}
      if mode == "core-socks-empty" {proxy.excludedDomains = [];proxy.matchDomains = []}
      if mode == "core-socks-explicit" {proxy.excludedDomains = [];proxy.matchDomains = ["127.0.0.1","lyco-fixture.invalid"]}
      if mode == "core-socks-wildcard" {proxy.excludedDomains = [];proxy.matchDomains = ["*"]}
      proxy.allowFailover = false
      store.proxyConfigurations = [proxy]
      row["configurationCount"] = store.proxyConfigurations.count
      row["allowsFailover"] = store.proxyConfigurations.first?.allowFailover ?? true
    }
    let config = WKWebViewConfiguration();config.websiteDataStore = store
    let view = WKWebView(frame: window!.rootViewController!.view.bounds,configuration: config)
    view.autoresizingMask = [.flexibleWidth,.flexibleHeight];view.navigationDelegate = self
    window!.rootViewController!.view.addSubview(view);web = view
    let host = phase == "domain" ? "lyco-fixture.invalid" : "127.0.0.1"
    let timer = DispatchWorkItem {if self.generation == current {self.finish("timeout")}}
    timeout = timer;DispatchQueue.main.asyncAfter(deadline: .now()+6,execute: timer)
    view.load(URLRequest(url: URL(string: "http://"+host+":18080/probe?case="+caseId)!))
  }
  private func finish(_ status: String) {
    guard finishedGeneration != generation else {return}
    finishedGeneration = generation
    timeout?.cancel();timeout = nil
    row["result"] = status;results.append(row);index += 1
    web?.stopLoading();web?.navigationDelegate = nil;web?.removeFromSuperview();web = nil
    try? core?.close();core = nil
    DispatchQueue.main.asyncAfter(deadline: .now()+0.15) {self.next()}
  }
  func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) {
    let current = generation
    webView.evaluateJavaScript("document.body.textContent") {value,error in
      guard self.generation == current else {return}
      self.row["originContent"] = (value as? String)?.contains("LYCO_ORIGIN "+(self.row["case"] as! String)) ?? false
      self.finish("loaded")
    }
  }
  func webView(_ webView: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) {
    row["errorCode"] = (error as NSError).code;finish("navigation-failed")
  }
  func webView(_ webView: WKWebView,didFail navigation: WKNavigation!,withError error: Error) {
    row["errorCode"] = (error as NSError).code;finish("navigation-failed")
  }
}
UIApplicationMain(CommandLine.argc,CommandLine.unsafeArgv,nil,NSStringFromClass(ProbeDelegate.self))
