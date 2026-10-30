# 移动原生网络边界

目标是验证实际安装包使用所选线路，并在上游失效时不直连。已通过的 Android 官网绑定验收与 Go 核心 HTTPS/WSS/IPv6 检查保持各自范围，不能据此推断原生 WebView 的完整 DNS/RTC 边界。

2026-10-28 下一步先探测 WebRTC：使用已验收的 `655e071` 原签名 APK、API35 设备和测试自有 HTTP/CONNECT 上游及 STUN 接收器。另编译一个测试专用普通 WebView Activity，使用同一系统 provider、同一设备，作为不配置代理的真实 WebRTC 正向对照。对照必须完成实际 PeerConnection 且向 STUN 发包；产品网页与报告的 HTTP 路由按实际 TCP 连接归属观察，不能只相信网页自报。产品健康及上游停止后的两次 PeerConnection 使用不同 STUN 端口，避免延迟包混淆。

决策：先复用原安装包和公开 Android WebView API 取得边界证据；不先改内核或增加 VPN。直连对照不成立则本轮无效，不能把零包作为保护成功。若产品发出直接 UDP 或暴露字面 IP 候选，则明确记录未通过，再评估系统网络约束的实现。

依据：[AndroidX ProxyConfig](https://developer.android.com/reference/androidx/webkit/ProxyConfig) 描述浏览代理规则；[Chromium WebView 架构](https://chromium.googlesource.com/chromium/src/+/main/android_webview/docs/architecture.md) 说明它与 Chrome 的宿主边界不同；[Chrome WebRTC 代理策略](https://developer.chrome.com/blog/chrome-47-webrtc)另有非代理 UDP 控制，不能推断 WebView 配置代理就具备同等策略。现有复用候选包括 sing-box 与 tun2socks（实际 GitHub 查询记录），后续若需要系统隧道，优先核对当前已有 sing-box 的平台接口与许可，避免增加重复核心。当前没有实施该架构变更。

探测仅覆盖自有 STUN、所测 provider/API35 和 HTTP 上游，不构成客户公网出口、所有 DNS/IPv6/RTC 或 iOS 的通过证明。测试控制 Activity 不进入产品 APK，产品本身不增加测试入口、伪造 RTC 观测或禁用 TLS。

## 已观察到的失败及修复候选

真实 [40715613765](https://github.com/lilyco-42/lyco-browser/actions/runs/40715613765) 对 `655e071` 原签名 APK 的探测有效但未通过。API35、AOSP WebView124.0.6367.219，前后普通 WebView 对照各接收到一次实际 STUN；产品健康及上游停止后也各有一次直接 STUN。产品 HTTP 页与报告实际经过所选上游，但两个 RTC 观察均有 IPv4/IPv6 host 与实际 NAT srflx 字面地址。候选和数据包记录原样保留，没有用新期望替换失败。该结果不否定已有绑定/存储验收，但明确阻止将此候选视作完整 RTC 保护通过。

当前修复候选复用已支持的 [document-start API](https://github.com/androidx/androidx/blob/androidx-main/webkit/webkit/src/main/java/androidx/webkit/WebViewCompat.java)：在导航前向全部匹配帧注册实际 RTC 配置约束，只允许 relay 与明确 TURN TCP/TLS；后续 setConfiguration、旧构造器别名和原型构造器也保留约束。WebRTC 原生事件、SDP、统计和候选不替换，不伪装策略或 native 函数文本。保留现有 Chromium 网站数据空间，不换引擎或增加设备 VPN。

这只是待验证实现，不能以 STUN URL 被过滤或单元模型通过宣称边界已修复。必须补充真实首脚本/嵌套帧/初始空文档、原生 SDP/getStats、恶意配置改写，以及实际 TURN TCP 通信经所选代理的正向和断线负向。若原生 TURN TCP 绕过代理或任何上下文仍漏出地址，则保持失败并继续修复。网站仅提供 UDP/STUN 时无法建立媒体直连，这是所测 HTTP 代理下的传输限制，不能扩大为所有 RTC 站点均可用。

扩展探测直接运行所构建的原签名 APK：每个阶段用八个不同 STUN 端口，覆盖首脚本、初始 about:blank、srcdoc 的嵌套空帧、跨域子帧、原型构造器、可用的旧别名、setConfiguration 和被改写的基础方法。所有原生事件、SDP 和 local-candidate 统计原样保留。断线阶段复用预先加载的子帧，避免把子帧下载失败误当作保护；实际完成状态先取原生 UI 和上游停止快照，再仅恢复报告上传路径。

功能正向使用测试自有 [coturn](https://github.com/coturn/coturn/blob/master/README.turnserver) TCP 入口和 [aiortc](https://aiortc.readthedocs.io/en/latest/api.html) 对端。coturn 只绑定 runner 的回环地址，使用明确 CI 凭据和测试专用回环 relay；数据通道必须实际收发 PING/ACK，TURN 原始 TCP 按连接源端口区分所选代理与直接连接。前后同 provider 的普通 WebView 同样必须通过真实 TURN 数据通道，防止服务夹具失效造成伪阴性。原始 relay 地址允许出现在 TURN 正向记录中，设备 host/srflx 和相关地址仍拒绝；STUN 场景原有无字面 IP 断言不变。本探测不是摄像头/音频、所有网站或公网 TURN 可用性证明。

## 扩展原生结果：部分约束有效，空文档仍绕过

`ced08fe` 签名构建 [40721798567](https://github.com/lilyco-42/lyco-browser/actions/runs/40721798567) 的原有原生回归成功。对其同一未修改 APK，扩展 [40724556782](https://github.com/lilyco-42/lyco-browser/actions/runs/40724556782) 已完整运行并明确失败，`validProbe=true`。APK SHA-256 为 `3b8ba20629c1f8d9d0661318740938c31ab7225f4624fde5b91e1be6c9995038`，保留签名匹配，运行时源码差异为空。

前后普通 WebView 的八个场景各收到实际 STUN，真实 TURN 数据通道也各收到 ACK。产品主页面、跨域页面、原型/旧别名、setConfiguration 和基础方法改写均实际为 relay，原始候选、候选 SDP 与 local-candidate 统计无设备地址；主页面实际 TURN TCP 经所选上游并收到真实 ACK，断线上游后未出现直接 TURN TCP 或 ACK。

**初始 about:blank 与 srcdoc 内新建空帧仍为 `iceTransportPolicy=all`。** 健康及断线上游时各收到两次实际 STUN，两个上下文均在原生事件、SDP 和统计暴露实际 IPv4/IPv6 host 与 NAT srflx 地址。断线阶段的原始 UI、上游停止快照及恢复后上传的原观察均保留；没有重复健康条件下的停止探测，也没有改写 native 读数。全部 PeerConnection 均真实创建，因此不能归为不支持 RTC 或对照无效。

下一步决策：所测 provider 的 document-start 策略不能作为完整新上下文的安全边界。不能用只拦 `contentWindow` 的 getter 来覆盖现有两个测试后宣称修复，因为同源窗口还可经 `window.frames`、`contentDocument.defaultView`、文档同步写入等路径取得。继续评估能在原生引擎层统一生效的公开策略；GeckoView 的 WebExtension [`privacy.network.webRTCIPHandlingPolicy`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) 有原生候选，但尚无本产品原生证据，且引擎更换必须处理并保留现有 Chromium Cookie/IndexedDB 数据，不能静默丢弃。当前未更换产品引擎、未增加 VPN、未批准商业发行。下一轮的最小验证与迁移约束见[引擎预研](MOBILE-ENGINE-PREFLIGHT.md)。
