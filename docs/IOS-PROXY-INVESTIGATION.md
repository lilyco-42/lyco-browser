# iOS 代理绕过定位

当前产品与独立试验都保留回环地址及停代理负向，尚未通过发行条件。[40608302339](https://github.com/lilyco-42/lyco-browser/actions/runs/40608302339) 的 22 个原生观察和有效直连对照表明，七种公开 WebView 代理配置均未同时满足健康代理路由与停代理时无直连；不能继续把切换 HTTP/SOCKS 或清空匹配列表当成修复。

## 已完成的系统请求对照

`beac7c9` 的 [41554045712](https://github.com/lilyco-42/lyco-browser/actions/runs/41554045712) 已实际编译并完成全部 29 个观察：iOS26.4 模拟器、SDK26.5、Xcode26.6/17F113。两种传输的直接正向均有效，源站收到 29 个原始请求，页面/响应内容均正确。结果如下：

| 传输 | 域名实际经过代理 | 健康上游时本机地址直连 | 停用上游时本机地址仍直连 |
| --- | ---: | ---: | ---: |
| WebView 七种配置 | 7/7 | 7/7 | 7/7 |
| URLSession HTTP/核心 SOCKS | 2/2 | 2/2 | 2/2 |

`allowFailover=false` 仍未阻止这些本机目标的直接访问。独立 URLSession 对照不加载工作台、Expo、WebView 或产品脚本，因此该反例不限于工作台界面或 LYCO 的 WebView 初始化；还不能据此认定某个封闭系统模块的确切缺陷或所有 iOS 版本均相同。当前没有通过的 WebView 配置，不能以 URLSession 替换浏览器或缩减本机地址要求。

原始 192529 字节 ZIP 的完整 SHA-256 为 `0e91fc6f142585962e7f2cbe05e1fbb2cbe28e12487a049b4734bafcbc7cab5b`，CRC 已核验。结果、源站归属、阶段时间和原始日志均保存。模拟器启动耗时 6 分 36 秒、安装 1 分 17 秒；应用从启动到收集结果约 48 秒。原始拒绝信息已打印，随后还报告步骤 9 分钟总时限到达。所有 29 个观察已完成，不能把这个总时限当成唯一失败原因，或当成缺少结果而重跑相同配置。

下一步需要区分 Foundation 与更低层 Network.framework 的路由选择；公开 `NWParameters.PrivacyContext` 和 `setPrivacyContext` 仅是后续独立对照的候选，当前尚未实现或验证。新增对照时应将模拟器准备与请求执行分成独立步骤，保留全部原有正负向和逐场景预算；不能通过增加请求时限让失败配置通过。

## 对照设计与来源

只读核对 WebKit 官方提交 `a55d669b8d818c654ebef6b00883197ac5484133` 的 [NetworkSessionCocoa.mm](https://github.com/WebKit/WebKit/blob/a55d669b8d818c654ebef6b00883197ac5484133/Source/WebKit/NetworkProcess/cocoa/NetworkSessionCocoa.mm)：代理配置经 NetworkSessionCocoa 传给系统 URLSessionConfiguration。文件 Git blob 为 `04ba654f099b671da6888f4ebdfac7a2f7f4f680`。这是当前上游实现线索，未证明与测试设备附带的 WebKit 版本相同，也未证明绕过发生在系统层。

本轮保留原来的全部 22 个 WebView 场景、域名与回环正向、停代理负向及每场景时限，再增加 7 个同设备 URLSession 对照。Apple 的 [URLSessionConfiguration.proxyConfigurations](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/proxyconfigurations) 从 iOS17 提供相同 ProxyConfiguration 接口。新对照使用同一个自有 HTTP 上游、相同核心认证 SOCKS、相同目标与源站 TCP 归属记录；各有直连正向和代理域名正向，后者不成立时不能归因回环行为。

独立测试 App 允许自有 HTTP 请求；产品 ATS、代理设置、数据与内核不改。29 个观察完整结束后才分析；仅整体采集等待增加 42 秒加收集余量，原来的 WebView 6 秒与首轮正向 30 秒预算不变。URLSession 的结果单独列出，不能用于把失败的 WebView 验收变为成功，也不以 URLSession/自定义 scheme 替换浏览器。

实际运行仅在 GitHub Actions。本轮原始结果支持继续定位系统代理层，不再重复同一 HTTP/SOCKS 匹配列表组合。产品 ATS、环境数据和默认内核未修改，未申请或伪造额外 entitlement；iOS 路由发行门禁仍未通过。
