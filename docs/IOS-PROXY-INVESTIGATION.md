# iOS 代理绕过定位

当前产品与独立试验都保留回环地址及停代理负向，尚未通过发行条件。[40608302339](https://github.com/lilyco-42/lyco-browser/actions/runs/40608302339) 的 22 个原生观察和有效直连对照表明，七种公开 WebView 代理配置均未同时满足健康代理路由与停代理时无直连；不能继续把切换 HTTP/SOCKS 或清空匹配列表当成修复。

## 最新 36 个原生观察

`3470773` 的 [41557341314](https://github.com/lilyco-42/lyco-browser/actions/runs/41557341314) 已通过独立准备步骤及源码/运行/可执行文件摘要绑定，完成全部 36 个唯一场景。iOS26.4 模拟器、SDK26.5、Xcode26.6/17F113；三层直接正向均有效，三层域名均真实经过代理，实际配置读回均为一项代理且 `allowFailover=false`。新增低层 TCP 对照结果：

| NWConnection + 独立 PrivacyContext | HTTP CONNECT | 核心 SOCKS |
| --- | ---: | ---: |
| 域名经过代理 | 1/1 | 1/1 |
| 健康时本机地址直接访问 | 1/1 | 1/1 |
| 停用上游后本机地址直接访问 | 1/1 | 1/1 |

原来的 WebView 与 URLSession 反例同时保持，所有 36 份源站内容均完整收到，但没有安全 WebView 模式。请求阶段约 30 秒，没有总时限超时，明确因原路由门槛失败而退出 1；不能再归因于准备时间或上层响应解析。它把反例扩展到所测系统 TCP 接口，不证明封闭系统内部的确切实现原因，也不是所有 iOS 版本的结论。

原始 187072 字节 ZIP 的 SHA-256 为 `71d2a8427ebff24ae8024fff2aec673972aa2009f1432eadeaa582d653b3ae6c`，完整大小和 CRC 已核验，原始结果、归属和日志保留。公开 API 的另一类 [HTTP/2 RelayHop](https://developer.apple.com/documentation/network/proxyconfiguration/relayhop) 是后续最小互通候选；下节为后续测试源码，尚无采用或通过证明。其试验必须保留原 36 项、真实代理正向、停上游负向及严格 TLS；API 文档存在不代表它已经解决本机地址边界。

## HTTP/2 Relay 最小互通源码

`097f88c` 的真实 [41562850867](https://github.com/lilyco-42/lyco-browser/actions/runs/41562850867) 已完成全部 48 个唯一场景，因原生路由门槛失败退出 1，无请求步骤总时限超时。完整原始 ZIP 为 230121 字节、SHA-256 `b6f1ffcf5035e6b786431bb8a78c78534cb7bea4ebfab196f775002dd3756e0f`，大小、摘要及 CRC 已核验。48 份原生观察、44 次原生源站访问与 1 次单独标识的夹具访问分别保留。

| Relay 传输 | 域名与严格 TLS 正向 | 错误 CA 负向 | 健康 / 停上游本机地址 |
| --- | --- | --- | --- |
| WebView | 导航 -1202，验证回调 0 次，未成立 | 同为 -1202、回调 0 次，不能计作有效原生证书对照 | 两次均直接收到源站内容 |
| URLSession | 真实 h2/TLS1.3 CONNECT，验证接受 1 次，源站归属代理 | 实际拒绝 1 次，无源站访问 | 两次均直接收到源站内容 |
| NWConnection | 真实 h2/TLS1.3 CONNECT，验证接受 1 次，源站归属代理 | 实际拒绝 1 次并报告 TLS 错误，至本例时限退出，无源站访问 | 两次均直接收到源站内容 |

Node 夹具的可信 CONNECT 与错误 CA 拒绝均有效；原有 36 项和三层域名正向、配置读回仍有效。这里确认 Relay 在两个系统传输的严格 TLS 互通，并继续重现其本机绕过；WebView 自定义信任回调未触发是额外的接入障碍，不证明确切系统内部原因。没有安全模式，不能接入产品、以其他传输替代 WebView，或安装全局 CA/取消证书验证来让它变绿。同协议参数重试已无依据；本轮没有部署服务、改变产品或证明 UDP/RTC、真机及完整发行。

后续测试源码保留上述 36 项，新增三层传输的 Relay 域名/本机/停上游场景及每层错误证书负向，共 48 项。原有逐请求 6 秒和首个 WebView 正向 30 秒不变，整体收集与步骤预算仅为新增场景增加余量。

独立 Node22 HTTP/2 夹具只监听运行器回环，允许两个自有目标的 CONNECT，继续经过同一个 Python HTTP 代理；源站原有 TCP 源端口归属规则保持，并额外记录实际 H2 流及原生场景编号。Node 控制请求与原生请求分别标识，不将夹具正向计作浏览器证明。它只验证 TCP 互通，不实现或声称 UDP/RTC 已通过。

两套临时 CA/叶证书和私钥仅在真实 Actions 运行器生成；私钥目录不进入工件。App 只打包公开的正确信任锚，并绑定资源摘要。通过公开 [TLS 验证回调](https://developer.apple.com/documentation/security/sec_protocol_options_set_verify_block(_:_:_:))，为该信任对象限制锚、验证 127.0.0.1 服务器身份、禁止网络取证后实际评估信任；没有接受全部证书、安装系统 CA 或修改全局 TLS。第二个 Relay 端口使用另一 CA，原生回调必须实际拒绝它且源站不能收到该场景请求。配置无法携带验证回调、正向不成立或负向未拒绝时，均不能据此采用方案。

夹具本身先以正确 CA 完成真实 CONNECT/源站内容正向，再以同一信任锚拒绝第二端口的错误 CA。原生结果另要求 H2 流归属、可信证书验证、全部健康目标经代理、停上游无源站访问。只有实际 WebView 场景全部成立才允许进一步讨论接入产品，其他传输成功不能替代它。上述真实运行已编译并完整执行，但未通过；产品、用户数据及默认内核均未替换。

## 已完成的系统请求对照

`beac7c9` 的 [41554045712](https://github.com/lilyco-42/lyco-browser/actions/runs/41554045712) 已实际编译并完成全部 29 个观察：iOS26.4 模拟器、SDK26.5、Xcode26.6/17F113。两种传输的直接正向均有效，源站收到 29 个原始请求，页面/响应内容均正确。结果如下：

| 传输 | 域名实际经过代理 | 健康上游时本机地址直连 | 停用上游时本机地址仍直连 |
| --- | ---: | ---: | ---: |
| WebView 七种配置 | 7/7 | 7/7 | 7/7 |
| URLSession HTTP/核心 SOCKS | 2/2 | 2/2 | 2/2 |

`allowFailover=false` 仍未阻止这些本机目标的直接访问。独立 URLSession 对照不加载工作台、Expo、WebView 或产品脚本，因此该反例不限于工作台界面或 LYCO 的 WebView 初始化；还不能据此认定某个封闭系统模块的确切缺陷或所有 iOS 版本均相同。当前没有通过的 WebView 配置，不能以 URLSession 替换浏览器或缩减本机地址要求。

原始 192529 字节 ZIP 的完整 SHA-256 为 `0e91fc6f142585962e7f2cbe05e1fbb2cbe28e12487a049b4734bafcbc7cab5b`，CRC 已核验。结果、源站归属、阶段时间和原始日志均保存。模拟器启动耗时 6 分 36 秒、安装 1 分 17 秒；应用从启动到收集结果约 48 秒。原始拒绝信息已打印，随后还报告步骤 9 分钟总时限到达。所有 29 个观察已完成，不能把这个总时限当成唯一失败原因，或当成缺少结果而重跑相同配置。

后续源码新增 7 个 Network.framework 原生 TCP 对照：使用公开 [NWParameters.PrivacyContext](https://developer.apple.com/documentation/network/nwparameters/privacycontext) 的相同代理配置，再用 [setPrivacyContext](https://developer.apple.com/documentation/network/nwparameters/setprivacycontext(_:)) 关联 NWConnection 参数。每次请求独立创建连接和上下文，直接发送自有 HTTP 请求，检查原始状态码、内容和源站 TCP 归属，不经过 URLSession。其直连和域名代理正向未成立时，不推断低层行为；结果也不能替代 WebView 验收。

原有 29 个场景保留，总计 36 个场景须各完成一次，并核对各传输配置的实际读回值。模拟器编译、启动和安装与请求执行分成独立步骤，跨步骤绑定同一运行、源码、设备与可执行文件摘要，拒绝旧结果和重复执行。请求阶段保留原有逐场景 6 秒及首个 WebView 正向 30 秒预算；外层采集等待增加 60 秒以覆盖新增 7 个请求及收集余量，不是原功能门槛变化。此新增源码已在上述运行实际编译与运行，产品未修改，原功能门槛仍失败。

## 对照设计与来源

只读核对 WebKit 官方提交 `a55d669b8d818c654ebef6b00883197ac5484133` 的 [NetworkSessionCocoa.mm](https://github.com/WebKit/WebKit/blob/a55d669b8d818c654ebef6b00883197ac5484133/Source/WebKit/NetworkProcess/cocoa/NetworkSessionCocoa.mm)：代理配置经 NetworkSessionCocoa 传给系统 URLSessionConfiguration。文件 Git blob 为 `04ba654f099b671da6888f4ebdfac7a2f7f4f680`。这是当前上游实现线索，未证明与测试设备附带的 WebKit 版本相同，也未证明绕过发生在系统层。

本轮保留原来的全部 22 个 WebView 场景、域名与回环正向、停代理负向及每场景时限，再增加 7 个同设备 URLSession 对照。Apple 的 [URLSessionConfiguration.proxyConfigurations](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/proxyconfigurations) 从 iOS17 提供相同 ProxyConfiguration 接口。新对照使用同一个自有 HTTP 上游、相同核心认证 SOCKS、相同目标与源站 TCP 归属记录；各有直连正向和代理域名正向，后者不成立时不能归因回环行为。

独立测试 App 允许自有 HTTP 请求；产品 ATS、代理设置、数据与内核不改。29 个观察完整结束后才分析；仅整体采集等待增加 42 秒加收集余量，原来的 WebView 6 秒与首轮正向 30 秒预算不变。URLSession 的结果单独列出，不能用于把失败的 WebView 验收变为成功，也不以 URLSession/自定义 scheme 替换浏览器。

实际运行仅在 GitHub Actions。本轮原始结果支持继续定位系统代理层，不再重复同一 HTTP/SOCKS 匹配列表组合。产品 ATS、环境数据和默认内核未修改，未申请或伪造额外 entitlement；iOS 路由发行门禁仍未通过。
