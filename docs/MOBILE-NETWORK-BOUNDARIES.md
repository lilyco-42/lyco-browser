# 移动原生网络边界

目标是验证实际安装包使用所选线路，并在上游失效时不直连。已通过的 Android 官网绑定验收与 Go 核心 HTTPS/WSS/IPv6 检查保持各自范围，不能据此推断原生 WebView 的完整 DNS/RTC 边界。

2026-10-28 下一步先探测 WebRTC：使用已验收的 `655e071` 原签名 APK、API35 设备和测试自有 HTTP/CONNECT 上游及 STUN 接收器。另编译一个测试专用普通 WebView Activity，使用同一系统 provider、同一设备，作为不配置代理的真实 WebRTC 正向对照。对照必须完成实际 PeerConnection 且向 STUN 发包；产品网页与报告的 HTTP 路由按实际 TCP 连接归属观察，不能只相信网页自报。产品健康及上游停止后的两次 PeerConnection 使用不同 STUN 端口，避免延迟包混淆。

决策：先复用原安装包和公开 Android WebView API 取得边界证据；不先改内核或增加 VPN。直连对照不成立则本轮无效，不能把零包作为保护成功。若产品发出直接 UDP 或暴露字面 IP 候选，则明确记录未通过，再评估系统网络约束的实现。

依据：[AndroidX ProxyConfig](https://developer.android.com/reference/androidx/webkit/ProxyConfig) 描述浏览代理规则；[Chromium WebView 架构](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/architecture.md) 说明它与 Chrome 的宿主边界不同；[Chrome WebRTC 代理策略](https://developer.chrome.com/blog/chrome-47-webrtc)另有非代理 UDP 控制，不能推断 WebView 配置代理就具备同等策略。现有复用候选包括 sing-box 与 tun2socks（实际 GitHub 查询记录），后续若需要系统隧道，优先核对当前已有 sing-box 的平台接口与许可，避免增加重复核心。当前没有实施该架构变更。

探测仅覆盖自有 STUN、所测 provider/API35 和 HTTP 上游，不构成客户公网出口、所有 DNS/IPv6/RTC 或 iOS 的通过证明。测试控制 Activity 不进入产品 APK，产品本身不增加测试入口、伪造 RTC 观测或禁用 TLS。
