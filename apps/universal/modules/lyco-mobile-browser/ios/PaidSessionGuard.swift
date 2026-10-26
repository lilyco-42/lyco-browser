import Foundation

/// A bounded, native-only lease. JWTs never enter website data or persistent storage.
final class PaidSessionGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let token: String
  private let owner: String
  private let onRevoked: () -> Void
  private var deadline: Date
  private var closed = false
  private var pollTimer: Timer?
  private var expiryTimer: Timer?
  private var session: URLSession?

  init(token: String, owner: String, deadline: Date, onRevoked: @escaping () -> Void) {
    self.token = token; self.owner = owner
    self.deadline = min(deadline, Date().addingTimeInterval(300))
    self.onRevoked = onRevoked
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }
  func start() {
    checkForeground()
    if !closed { armExpiry(); schedulePoll() }
  }
  func checkForeground() { if !closed && Date() >= deadline { revoke() } }
  func close() {
    closed = true
    pollTimer?.invalidate(); expiryTimer?.invalidate()
    session?.invalidateAndCancel(); session = nil
  }
  private func revoke() { close(); onRevoked() }
  private func armExpiry() {
    expiryTimer?.invalidate()
    expiryTimer = Timer.scheduledTimer(withTimeInterval: max(0.001, deadline.timeIntervalSinceNow), repeats: false) { [weak self] _ in self?.revoke() }
  }
  private func schedulePoll() {
    pollTimer?.invalidate()
    pollTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in self?.verify() }
  }
  private func parseExpiry(_ value: String) -> Date? {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = parser.date(from: value) { return date }
    parser.formatOptions = [.withInternetDateTime]
    return parser.date(from: value)
  }
  private func verify() {
    guard !closed, let session else { return }
    var request = URLRequest(url: URL(string: "https://lain42.top/studio/api/me")!)
    request.timeoutInterval = 15
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    session.dataTask(with: request) { [weak self] data, response, _ in
      DispatchQueue.main.async {
        guard let self, !self.closed else { return }
        let status = (response as? HTTPURLResponse)?.statusCode
        if status == 401 || status == 403 { self.revoke(); return }
        if status == 200, let data, data.count <= 2_000_000,
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          var active = false
          var expiry: Date?
          if object["username"] as? String == self.owner, let items = object["entitlements"] as? [[String: Any]] {
            for item in items {
              guard item["product"] as? String == "proxy_1m", item["status"] as? String == "active",
                let meta = item["meta"] as? [String: Any], let sub = meta["sub_url"] as? String,
                sub.range(of: "^https://lain42\\.top/panel/api/sub/[A-Za-z0-9_-]{6,128}$", options: .regularExpression) != nil else { continue }
              if let value = item["expires_at"] as? String, !value.isEmpty {
                guard let parsed = self.parseExpiry(value), parsed > Date() else { continue }
                expiry = parsed
              }
              active = true; break
            }
          }
          if !active { self.revoke(); return }
          self.deadline = min(Date().addingTimeInterval(300), expiry ?? .distantFuture)
          self.armExpiry()
        }
        self.checkForeground()
        if !self.closed { self.schedulePoll() }
      }
    }.resume()
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
