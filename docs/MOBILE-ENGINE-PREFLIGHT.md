# 移动引擎下一轮验证决策

需求保持五平台代理连接与独立环境：不能泄漏网站数据、节点凭据或绕过所选线路；现有用户环境和数据不能因换引擎静默丢失。当前 Android document-start 方案的真实空文档反例见[网络边界](MOBILE-NETWORK-BOUNDARIES.md)，不是假设。

## 实际调研与约束

| 候选 | 已取得证据 | 尚缺及决策 |
| --- | --- | --- |
| 现有 WebView + document-start | 新签名包实际 TURN TCP 经所选上游，六类上下文约束有效；初始/嵌套空帧仍实际直接 STUN | 保留失败，不用有限 DOM getter 包装冒充引擎边界 |
| 现有 sing-box + Android VPN | 复用现有核心；公开 VpnService 有 per-app 与 protect(fd) 能力 | 单靠包路由不等于隐藏原生 host 候选；还要处理撤权/默认路由窗口及用户 VPN 权限，不能据 API 存在宣称通过 |
| GeckoView 原生策略 | 官方公开构建器提供 [configFilePath](https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/GeckoRuntimeSettings.Builder.html#configFilePath(java.lang.String))，原生 WebExtension 提供 [privacy.network](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) 的 proxy_only 选项 | 有更早施加引擎偏好的入口，尚未在本产品证明；先做独立原生能力试验，不能直接替换已有环境 |

实际 `gh search repos`（2026-10-29 CST）找到 [FaFre/WebLibre](https://github.com/FaFre/WebLibre) 1077星、AGPL-3.0，以及 [prirai/nira-browser](https://github.com/prirai/nira-browser) 211星、MPL-2.0；特定 `geckoview browser proxy` 和 `geckoview webextension privacy` 搜索未找到直接覆盖需求的候选。没有把星数当成功能证明。

已只读克隆 Nira，固定 `ef717b65071557e707ffea299aa9a6367f9730ac`。[UserJsPreferences.kt](https://github.com/prirai/nira-browser/blob/ef717b65071557e707ffea299aa9a6367f9730ac/app/src/main/java/com/prirai/android/nira/components/UserJsPreferences.kt#L143) 在 runtime 构建前写私有配置并传给公开 configFilePath；[Components.kt](https://github.com/prirai/nira-browser/blob/ef717b65071557e707ffea299aa9a6367f9730ac/app/src/main/java/com/prirai/android/nira/components/Components.kt#L680) 调用它。未运行或复制该项目代码。它允许用户 about:config 改写默认偏好，不能直接用其配置当 LYCO 的强制保护证明。

[W3C 扩展讨论](https://github.com/w3c/webextensions/issues/1009)也指出同步取得新空文档可能先于 document_start 的时序问题；它是相关线索，不替代本次 Android 原生反例。论坛搜索中的“停用 RTC”或“伪装候选”建议不采用。上述引擎替换并不覆盖 iOS，iOS 既有本机路由失败另需解决。

## 下一步最小实施

先构建一个测试专用 GeckoView APK，只在真实 Actions 运行；不进入产品、不改既有环境目录。使用公开配置/内置 WebExtension施加原生代理与RTC策略，保留真实候选、SDP、getStats，不加入页面构造器或 DOM 包装，不关闭 PeerConnection。需要实际 `debuggable=false` 验证，避免依赖只在调试包生效的配置。

1. 前后同引擎无策略正向对照必须实际发出 STUN 并通过自有 TURN TCP 数据通道；不能拿 WebView 的结果替代 Gecko 对照。
2. 复用八类首脚本/子帧/改配置场景，额外检查经 window.frames、contentDocument.defaultView 取得的空文档。原生事件、候选 SDP 与统计均不能提供设备地址，测试上游不能收到直接 UDP。
3. 健康时真实 TURN TCP 与信令都经所选上游并收到对端 ACK；停止上游时没有直接 TURN/源站访问，且独立对照健康。不能把 RTC 全部不可用视为通过。
4. 特别核对真实回环目标。官方 [proxy.settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings) 明示回环默认不走代理，因此不能用 10.0.2.2 的成功替代 127.0.0.1 / IPv6 loopback 的负向；公开可配置能力也要实际验证。
5. 只有能力试验成立后，才设计新引擎环境版本和显式迁移。先证明 A/B Cookie/localStorage/IndexedDB 隔离与关闭重开；保留原 UUID、旧 Chromium 数据和降级保护。不能靠通用导出假定能迁移不可导出的 IndexedDB CryptoKey。

投入决策：当前先验证原生能力的最小试验，避免在没有底层证据时重写整个客户端或扩充脆弱的页面拦截。应用引擎、依赖和用户数据结构本轮均未更换；商业发行仍未通过。
