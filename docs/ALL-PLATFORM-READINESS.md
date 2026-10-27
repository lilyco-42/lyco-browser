# 五平台商业发行进度

目标保持为 Windows x64、macOS ARM64、Linux x64、Android、iOS 均具备代理连接与独立浏览环境，再发行。当前 PR：[#31](https://github.com/lilyco-42/lyco-browser/pull/31)。默认下载仍指向 README 中已验收的旧 Windows 预览包。

## 已有证据

| 范围 | 源码提交及 Actions | 证明的范围 |
| --- | --- | --- |
| Windows | `cdae6b1`，[40373569085](https://github.com/lilyco-42/lyco-browser/actions/runs/40373569085) | 打包前与便携包验收通过，但安装版在 A 的新标签首脚本读到内存 8、期望 4，整体失败。`6979216` 又暴露 CRLF 文件上的更新器源码匹配错误，已修正；当前代码继续验证原生 navigator 自有属性的处理 |
| macOS ARM64、Linux x64 | `02526cf`，[40449389381](https://github.com/lilyco-42/lyco-browser/actions/runs/40449389381) | 真实打包应用、Mihomo、两个受管环境、代理流量、Cookie/localStorage 隔离与 A 重开、受控 RTC peer/STUN、退出、HTTP/WebSocket/TLS ClientHello 失效代理检查及真实直连环境对照通过 |
| Go 移动核心与源码包 | `6979216`，[40376368484](https://github.com/lilyco-42/lyco-browser/actions/runs/40376368484) | HTTP、本机认证、停止、SOCKS5、SS、VMess、VLESS、Trojan、Hysteria2、TUIC、VMess/VLESS WebSocket、VLESS gRPC 真实服务链及 race 检查通过；Android/Apple 绑定成功，源码审阅包首次保留了 405 个应用和绑定工具模块 |
| iOS 原生运行 | `6979216`，[40376368610](https://github.com/lilyco-42/lyco-browser/actions/runs/40376368610) | 原生编译、实际 Go 代理、地址栏/历史/刷新、A/B Cookie 与 localStorage 隔离及 A 重开通过；清除操作后的结果提示不可见，整体失败，尚未运行清除后重开与断代理检查 |
| Android 原生运行 | `6979216`，[40376368610](https://github.com/lilyco-42/lyco-browser/actions/runs/40376368610) | 同上，并通过控制页返回后后台浏览进程确实退出的检查；同样在清除结果提示可见性断言失败，整体失败，尚未验证清除后 A/B 存储与断代理 |

历史 Windows `c67433a` 的 [40340561128](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561128) 曾通过完整便携和安装验收，但不能替代当前版本。iOS 更早的本机直连负向失败也仍需回归验证，不能删除断言。移动端已将操作提示移到固定可见区域；实际清除效果仍必须由清除后重开 A 为空、B 保留原数据来证明。

PR 工作流的 `GITHUB_SHA` 是 GitHub 测试合并提交；报告记录该 SHA，不应误写为分支 head。原始截图、网络记录和报告保留在对应 Actions Artifact，测试不上传身份缓存、账号 JWT 或节点凭据。Billing 使用 CI 夹具；没有真实付款或客户线路验收。

## 正在修复及尚需完成

- iOS 为显式 loopback 匹配和普通网站全局规则分别创建原生代理配置，均保留 `allowFailover=false`；普通域名与停代理用例都必须通过，不能删除失败断言。
- Cookie 持久化夹具桌面使用 `Max-Age=600`、移动使用 `Max-Age=3600`，覆盖多轮原生驱动启动的测试窗口；会话 Cookie 退出浏览器后失效属于正常语义，不将其伪造为永久 Cookie。
- 移动端退出、切换账号或返回列表时关闭原生环境；Android 额外验收后台浏览进程确实退出。
- 移动原生地址栏、前进后退、刷新和 URL 协议限制需真实 UI 与网络记录证明。
- 移动清除网站数据和删除环境使用原生完整清除接口，失败保留条目；验收必须证明清除 A 后 A 变为空白、B 的存储仍保留。Android 此功能需要系统 WebView 支持 `DELETE_BROWSING_DATA`。
- 桌面新增失效上游的 HTTP、WebSocket 和 TLS ClientHello 检查，并用普通直连环境进行对照；`f2f61f4` 的 macOS/Linux 已通过，Windows 完整门禁仍失败。TLS 接收器观察的是连接与握手起始数据，不是受信任 HTTPS 页面内容。
- 进一步完成各平台代理失效的 HTTP/HTTPS/WebSocket、DNS/IPv6 和移动 RTC 边界验证。现有受控 RTC 结果不能扩展为全网络无泄漏。
- Android 正式签名候选仍需实际打包、签名核验和运行验收。已保留公钥证书，新增正式候选的签名指纹匹配及来源记录；已配置签名材料不等于候选已通过。
- iOS 新增手动真机 ARM64 未签名归档流程与平台核验，见 [设备候选说明](IOS-DEVICE-CANDIDATE.md)，首次构建仍待执行。真机签名与分发、macOS 签名公证、Windows 商业代码签名、商店账号和正式审核尚未完成。
- 移动代理核心、桌面内核、字体及全部依赖的随包许可与对应源码交付须完成；保留现有授权记录与第三方文件。
- 移动端新增离线网络组件许可入口，内含固定 sing-box 版本的完整版权声明（含名称/关联限制）、GPLv3 原文和源码链接；这尚不能替代全部传递依赖清单及对应源码交付。
- 网络核心新增源码审阅包生成步骤：包含实际测试提交、Go 应用及绑定工具的模块原始 ZIP、解析后的锁文件与校验清单。`6979216` 已在 Actions 首次生成，含 405 个模块；不覆盖 npm、Pods、Android 依赖和平台 SDK 的完整交付。
- 自动更新新增正式渠道过滤：只接受 `vX.Y.Z`，拒绝草稿、预发布及 `ci-*`/`review-*` 标签；API 不可用时只信任官网 `/releases/latest` 的正式标签跳转，不从订阅流或 HTML 普通链接选新版。下载 URL 限定到本仓库正式标签及所选文件；模块测试及 macOS/Linux 集成已通过，Windows CRLF 适配仍在当前原生流程验证。统一应用版本、正式安装包签名和更新包摘要核验尚需完成。
- Mihomo 的既有随包文件误写为 MIT；已按官方 v1.19.32 替换为 GPLv3 原文，Git blob SHA 为 `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`，随包携带来源记录并增加回归检查。这不等于其他依赖或整个应用已完成分发许可审查。

功能和运行门禁通过前不合并发行，不把模拟器 App 称作 iPhone 安装包，不用源码检查替代五平台成品验收。所有产品测试与构建只在 GitHub Actions 执行。
