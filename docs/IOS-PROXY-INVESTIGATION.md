# iOS 代理绕过定位

当前产品与独立试验都保留回环地址及停代理负向，尚未通过发行条件。[40608302339](https://github.com/lilyco-42/lyco-browser/actions/runs/40608302339) 的 22 个原生观察和有效直连对照表明，七种公开 WebView 代理配置均未同时满足健康代理路由与停代理时无直连；不能继续把切换 HTTP/SOCKS 或清空匹配列表当成修复。

只读核对 WebKit 官方提交 `a55d669b8d818c654ebef6b00883197ac5484133` 的 [NetworkSessionCocoa.mm](https://github.com/WebKit/WebKit/blob/a55d669b8d818c654ebef6b00883197ac5484133/Source/WebKit/NetworkProcess/cocoa/NetworkSessionCocoa.mm)：代理配置经 NetworkSessionCocoa 传给系统 URLSessionConfiguration。文件 Git blob 为 `04ba654f099b671da6888f4ebdfac7a2f7f4f680`。这是当前上游实现线索，未证明与测试设备附带的 WebKit 版本相同，也未证明绕过发生在系统层。

下一轮保留原来的全部 22 个 WebView 场景、域名与回环正向、停代理负向及每场景时限，再增加 7 个同设备 URLSession 对照。Apple 的 [URLSessionConfiguration.proxyConfigurations](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/proxyconfigurations) 从 iOS17 提供相同 ProxyConfiguration 接口。新对照使用同一个自有 HTTP 上游、相同核心认证 SOCKS、相同目标与源站 TCP 归属记录；各有直连正向和代理域名正向，后者不成立时不能归因回环行为。

独立测试 App 允许自有 HTTP 请求；产品 ATS、代理设置、数据与内核不改。29 个观察完整结束后才分析；仅整体采集等待增加 42 秒加收集余量，原来的 WebView 6 秒与首轮正向 30 秒预算不变。URLSession 的结果单独列出，不能用于把失败的 WebView 验收变为成功，也不以 URLSession/自定义 scheme 替换浏览器。

实际运行仅在 GitHub Actions。根据原始结果决定下一步：若 URLSession 同样绕过且域名代理对照成立，继续定位系统代理层；若它能严格走代理而 WebView 绕过，继续定位 WebKit 配置传递与会话行为。结果出来前不修改产品，不申请或伪造额外 entitlement，不宣称已修复。
