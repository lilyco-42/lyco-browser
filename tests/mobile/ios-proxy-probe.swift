// Actions-only investigation of the public iOS proxy API, without Expo or
// product fingerprint scripts. It never changes the product acceptance flows.
import UIKit
import WebKit
import Network
import Security
import Lycotunnel

@available(iOS 17.0, *)
@objc(ProbeDelegate)
final class ProbeDelegate: UIResponder, UIApplicationDelegate, WKNavigationDelegate {
  var window: UIWindow?
  private var web: WKWebView?
  private var core: LycotunnelSession?
  private var foundationSession: URLSession?
  private var networkConnection: NWConnection?
  private var networkContext: NWParameters.PrivacyContext?
  private var networkBytes = Data()
  private var timeout: DispatchWorkItem?
  private var index = 0
  private var generation = 0
  private var finishedGeneration = -1
  private var caseStartedUptime: TimeInterval = 0
  private var row: [String: Any] = [:]
  private var results: [[String: Any]] = []
  private let modes = ["direct-control", "direct-http", "direct-http-v6", "core-http", "core-socks", "core-socks-empty", "core-socks-explicit", "core-socks-wildcard"]
  private lazy var cases: [(String, String, String)] = {
    let original: [(String, String)] = self.modes.flatMap { mode in
      mode == "direct-control" ? [(mode,"local")] : [(mode,"domain"),(mode,"local"),(mode,"stopped-local")]
    }
    let foundation: [(String, String)] = ["direct-control", "direct-http", "core-socks"].flatMap { mode in
      mode == "direct-control" ? [(mode,"local")] : [(mode,"domain"),(mode,"local"),(mode,"stopped-local")]
    }
    let relay = ["webview","urlsession","network"].flatMap { transport in
      [(transport,"relay-h2","domain"),(transport,"relay-h2","local"),
       (transport,"relay-h2","stopped-local"),(transport,"relay-untrusted","domain")]
    }
    return original.map { ("webview", $0.0, $0.1) } + foundation.map { ("urlsession", $0.0, $0.1) }
      + foundation.map { ("network", $0.0, $0.1) } + relay
  }()
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
    let (transport,mode,phase) = cases[index]
    let caseId = (transport == "webview" ? "" : transport+"-")+mode+"-"+phase
    row = ["case":caseId,"mode":mode,"phase":phase,"transport":transport]
    caseStartedUptime = ProcessInfo.processInfo.systemUptime
    let store = transport == "webview" ? WKWebsiteDataStore(forIdentifier: UUID()) : nil
    var proxyConfigurations: [ProxyConfiguration] = []
    if mode != "direct-control" {
      var port = UInt16(phase == "stopped-local" ? 1 : 18081)
      if mode.hasPrefix("relay-") {port = phase == "stopped-local" ? 1 : mode == "relay-untrusted" ? 18083 : 18082}
      if mode.hasPrefix("core-") {
        let outbound = "{\"type\":\"http\",\"server\":\"127.0.0.1\",\"server_port\":"+String(port)+"}"
        var error: NSError?
        guard let session = LycotunnelStart(outbound,true,&error) else {finish("core-start-failed");return}
        core = session;port = UInt16(session.port())
      }
      // Different proxy and origin IPs distinguish a proxy-server-address
      // exemption from a general loopback exemption. Product gates stay intact.
      let endpoint = NWEndpoint.hostPort(host: mode == "direct-http-v6" ? "::1" : "127.0.0.1",port: NWEndpoint.Port(rawValue: port)!)
      var proxy: ProxyConfiguration
      if mode.hasPrefix("relay-") {
        guard let value = relayProxy(endpoint,generation: current) else {finish("relay-certificate-unavailable");return}
        proxy = value
      } else {
        proxy = mode.contains("socks") ? ProxyConfiguration(socksv5Proxy: endpoint) : ProxyConfiguration(httpCONNECTProxy: endpoint,tlsOptions: nil)
      }
      row["initialMatchCount"] = proxy.matchDomains.count;row["initialExcludedCount"] = proxy.excludedDomains.count
      if let core {proxy.applyCredential(username: core.username(),password: core.password())}
      if mode == "core-socks-empty" {proxy.excludedDomains = [];proxy.matchDomains = []}
      if mode == "core-socks-explicit" {proxy.excludedDomains = [];proxy.matchDomains = ["127.0.0.1","lyco-fixture.invalid"]}
      if mode == "core-socks-wildcard" {proxy.excludedDomains = [];proxy.matchDomains = ["*"]}
      proxy.allowFailover = false
      proxyConfigurations = [proxy]
      store?.proxyConfigurations = proxyConfigurations
      let applied = store?.proxyConfigurations ?? proxyConfigurations
      row["configurationCount"] = applied.count
      row["allowsFailover"] = applied.first?.allowFailover ?? true
    }
    if transport == "webview" {
      let config = WKWebViewConfiguration();config.websiteDataStore = store!
      let view = WKWebView(frame: window!.rootViewController!.view.bounds,configuration: config)
      view.autoresizingMask = [.flexibleWidth,.flexibleHeight];view.navigationDelegate = self
      window!.rootViewController!.view.addSubview(view);web = view
    }
    let host = phase == "domain" ? "lyco-fixture.invalid" : "127.0.0.1"
    // The first WKWebView also starts WebKit's processes. Its direct positive
    // control must actually complete before its absence can mean anything.
    // Proxy and stopped-proxy cases retain their original budget/assertions.
    let budget: TimeInterval = transport == "webview" && mode == "direct-control" ? 30 : 6
    row["navigationBudgetSeconds"] = budget
    let timer = DispatchWorkItem {if self.generation == current {self.finish("timeout")}}
    timeout = timer;DispatchQueue.main.asyncAfter(deadline: .now()+budget,execute: timer)
    let request = URLRequest(url: URL(string: "http://"+host+":18080/probe?case="+caseId)!)
    if transport == "network" {
      let parameters = NWParameters.tcp
      let context = NWParameters.PrivacyContext(description: "LYCO owned "+caseId)
      context.proxyConfigurations = proxyConfigurations
      if mode != "direct-control" {
        row["configurationCount"] = context.proxyConfigurations.count
        row["allowsFailover"] = context.proxyConfigurations.first?.allowFailover ?? true
      }
      parameters.setPrivacyContext(context);networkContext = context
      let connection = NWConnection(host: .init(host),port: .init(rawValue: 18080)!,using: parameters)
      networkConnection = connection;networkBytes = Data()
      connection.stateUpdateHandler = { [weak self,weak connection] state in
        guard let self,let connection,self.generation == current,self.finishedGeneration != current else {return}
        switch state {
        case .ready:
          if self.row["connectionReady"] as? Bool == true {return}
          self.row["connectionReady"] = true
          let bytes = Data(("GET /probe?case="+caseId+" HTTP/1.1\r\nHost: "+host+":18080\r\nConnection: close\r\n\r\n").utf8)
          connection.send(content: bytes,completion: .contentProcessed { [weak self,weak connection] error in
            guard let self,let connection,self.generation == current,self.finishedGeneration != current else {return}
            if let error {self.recordNetworkError(error);self.finish("send-failed");return}
            self.receiveNetwork(connection,generation: current,caseId: caseId)
          })
        case .waiting(let error):
          self.row["connectionWaiting"] = true;self.recordNetworkError(error)
        case .failed(let error):
          self.recordNetworkError(error);self.finish("connection-failed")
        default:break
        }
      }
      connection.start(queue: .main)
      return
    }
    if transport == "urlsession" {
      let config = URLSessionConfiguration.ephemeral
      config.proxyConfigurations = proxyConfigurations
      if mode != "direct-control" {
        row["configurationCount"] = config.proxyConfigurations.count
        row["allowsFailover"] = config.proxyConfigurations.first?.allowFailover ?? true
      }
      config.timeoutIntervalForRequest = budget;config.timeoutIntervalForResource = budget
      config.urlCache = nil
      let session = URLSession(configuration: config);foundationSession = session
      session.dataTask(with: request) { data,response,error in
        DispatchQueue.main.async {
          guard self.generation == current, self.finishedGeneration != current else {return}
          if let error {
            self.row["errorCode"] = (error as NSError).code
            self.finish("request-failed");return
          }
          let status = (response as? HTTPURLResponse)?.statusCode
          self.row["httpStatus"] = status
          self.row["originContent"] = status == 200 && String(data: data ?? Data(),encoding: .utf8)?.contains("LYCO_ORIGIN "+caseId) == true
          self.finish("loaded")
        }
      }.resume()
      return
    }
    web!.load(request)
  }
  private func relayProxy(_ endpoint: NWEndpoint,generation current: Int) -> ProxyConfiguration? {
    guard let url = Bundle.main.url(forResource: "relay-anchor",withExtension: "der"),
      let bytes = try? Data(contentsOf: url),let anchor = SecCertificateCreateWithData(nil,bytes as CFData) else {return nil}
    row["relayTrustChecks"] = 0;row["relayTrustAcceptedCount"] = 0;row["relayTrustRejectedCount"] = 0
    row["relayTrustSetupValid"] = true
    let options = NWProtocolTLS.Options()
    sec_protocol_options_set_verify_block(options.securityProtocolOptions,{ [weak self] _,trust,complete in
      let value = sec_trust_copy_ref(trust).takeRetainedValue()
      let statuses = [SecTrustSetNetworkFetchAllowed(value,false),
        SecTrustSetPolicies(value,SecPolicyCreateSSL(true,"127.0.0.1" as CFString)),
        SecTrustSetAnchorCertificates(value,[anchor] as CFArray),SecTrustSetAnchorCertificatesOnly(value,true)]
      let configured = statuses.allSatisfy { $0 == errSecSuccess }
      let accepted = configured && SecTrustEvaluateWithError(value,nil)
      DispatchQueue.main.async {
        guard let self,self.generation == current,self.finishedGeneration != current else {complete(false);return}
        self.row["relayTrustChecks"] = (self.row["relayTrustChecks"] as? Int ?? 0)+1
        let key = accepted ? "relayTrustAcceptedCount" : "relayTrustRejectedCount"
        self.row[key] = (self.row[key] as? Int ?? 0)+1
        self.row["relayTrustSetupValid"] = configured && (self.row["relayTrustSetupValid"] as? Bool ?? false)
        complete(accepted)
      }
    },DispatchQueue.global(qos: .userInitiated))
    let hop = ProxyConfiguration.RelayHop(http2RelayEndpoint: endpoint,tlsOptions: options,
      additionalHTTPHeaderFields: ["X-Lyco-Owned-Relay":"lyco-owned-fixture-v1"])
    return ProxyConfiguration(relayHops: [hop])
  }
  private func recordNetworkError(_ error: NWError) {
    switch error {
    case .posix(let code):row["errorDomain"] = "posix";row["errorCode"] = code.rawValue
    case .dns(let code):row["errorDomain"] = "dns";row["errorCode"] = code
    case .tls(let code):row["errorDomain"] = "tls";row["errorCode"] = code
    @unknown default:row["errorDomain"] = "unknown"
    }
  }
  private func receiveNetwork(_ connection: NWConnection,generation current: Int,caseId: String) {
    connection.receive(minimumIncompleteLength: 1,maximumLength: 4096) { [weak self,weak connection] content,_,complete,error in
      guard let self,let connection,self.generation == current,self.finishedGeneration != current else {return}
      if let content {self.networkBytes.append(content)}
      if self.networkBytes.count > 32768 {self.finish("oversized-response");return}
      if let error {self.recordNetworkError(error);self.finish("receive-failed");return}
      if complete {
        let response = String(data: self.networkBytes,encoding: .utf8) ?? ""
        let pieces = response.components(separatedBy: "\r\n\r\n")
        let status = response.components(separatedBy: "\r\n").first?.split(separator: " ")
        let code = status.flatMap { $0.count > 1 ? Int($0[1]) : nil }
        self.row["httpStatus"] = code;self.row["receivedBytes"] = self.networkBytes.count
        self.row["originContent"] = code == 200 && pieces.dropFirst().joined(separator: "\r\n\r\n").contains("LYCO_ORIGIN "+caseId)
        self.finish("loaded");return
      }
      self.receiveNetwork(connection,generation: current,caseId: caseId)
    }
  }
  private func finish(_ status: String) {
    guard finishedGeneration != generation else {return}
    finishedGeneration = generation
    timeout?.cancel();timeout = nil
    row["result"] = status
    row["elapsedSeconds"] = ProcessInfo.processInfo.systemUptime-caseStartedUptime
    results.append(row);index += 1
    web?.stopLoading();web?.navigationDelegate = nil;web?.removeFromSuperview();web = nil
    foundationSession?.invalidateAndCancel();foundationSession = nil
    networkConnection?.stateUpdateHandler = nil;networkConnection?.cancel();networkConnection = nil
    networkContext = nil;networkBytes = Data()
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
