# 五平台商业发行进度

目标保持为 Windows x64、macOS ARM64、Linux x64、Android、iOS 均具备代理连接与独立浏览环境，再发行。当前 PR：[#31](https://github.com/lilyco-42/lyco-browser/pull/31)。默认下载仍指向 README 中已验收的旧 Windows 预览包。

## 已有证据

| 范围 | 源码提交及 Actions | 证明的范围 |
| --- | --- | --- |
| Windows | `cdae6b1`，[40373569085](https://github.com/lilyco-42/lyco-browser/actions/runs/40373569085) | 打包前与便携包验收通过，但安装版在 A 的新标签首脚本读到内存 8、期望 4，整体失败。`6979216` 又暴露 CRLF 文件上的更新器源码匹配错误，已修正；当前代码继续验证原生 navigator 自有属性的处理 |
| macOS ARM64、Linux x64 | `0ddadfa`，[40455032067](https://github.com/lilyco-42/lyco-browser/actions/runs/40455032067) | 真实打包应用、Mihomo、两个受管环境、代理流量、Cookie/localStorage 隔离与 A 重开、受控 RTC peer/STUN、退出、HTTP/WebSocket/TLS ClientHello 失效代理检查及真实直连环境对照通过；实际更新器的完整性拦截、桌面应用版本与随包版本清单也通过 |
| Go 移动核心与源码包 | `6979216`，[40376368484](https://github.com/lilyco-42/lyco-browser/actions/runs/40376368484) | HTTP、本机认证、停止、SOCKS5、SS、VMess、VLESS、Trojan、Hysteria2、TUIC、VMess/VLESS WebSocket、VLESS gRPC 真实服务链及 race 检查通过；Android/Apple 绑定成功，源码审阅包首次保留了 405 个应用和绑定工具模块 |
| iOS 原生运行 | `a0ddb5c`，[40451827758](https://github.com/lilyco-42/lyco-browser/actions/runs/40451827758) | 地址栏/历史/刷新、A/B Cookie/localStorage/IndexedDB 隔离及 A 重开、清除 A 后三项为空且 B 保留、删除 A 并重启确认列表均通过；停代理后的 C 仍请求本机源站并完成三项写入，严格负向失败，禁止发行 |
| Android 原生运行 | `a0ddb5c`，[40451827758](https://github.com/lilyco-42/lyco-browser/actions/runs/40451827758) | 新存储布局在编译阶段暴露 AndroidX startup 功能检测的参数顺序错误，尚未运行；`9ee2387` 修正为 Context 在前，随 `0ddadfa` 运行验证。历史 `6979216` 已通过 A/B 与重开及后台进程退出，不能替代新布局验收 |
| iPhone ARM64 设备编译 | `a0ddb5c`，[40451856981](https://github.com/lilyco-42/lyco-browser/actions/runs/40451856981) | 首次使用 iPhoneOS SDK 26.5 构建并归档成功，主程序 Mach-O 平台为 IOS、最低版本 17，Payload 内有设备程序和离线 JS；无 provisioning profile、不能直接安装、未做真机运行验收。IPA SHA-256 为 `6484675c5e50cfc504c705fcbb8309ef416df3e0e6cc8522d6ccc9db91f6f6fc` |

历史 Windows `c67433a` 的 [40340561128](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561128) 曾通过完整便携和安装验收，但不能替代当前版本。iOS 的新证据已确认三项存储清除与 B 保留，同时再次确认本机直连问题，不能删除失败断言或以存储成功宣称整体通过。

PR 工作流的 `GITHUB_SHA` 是 GitHub 测试合并提交；报告记录该 SHA，不应误写为分支 head。原始截图、网络记录和报告保留在对应 Actions Artifact，测试不上传身份缓存、账号 JWT 或节点凭据。Billing 使用 CI 夹具；没有真实付款或客户线路验收。

## 正在修复及尚需完成

- iOS 显式 loopback 与普通网站双 HTTP 规则仍在 `a0ddb5c` 的本机负向中失败；正在改为公共 SOCKS5 API 连接已有的认证 mixed listener，保留 `allowFailover=false`，尚未证明能解决该问题。新增真实 SOCKS 入站认证、域名/IP 经指定 HTTP 出站、停止与端口关闭的 Go 检查；普通域名与停代理原生用例继续使用原断言。
- Cookie 持久化夹具桌面使用 `Max-Age=600`、移动使用 `Max-Age=3600`，覆盖多轮原生驱动启动的测试窗口；会话 Cookie 退出浏览器后失效属于正常语义，不将其伪造为永久 Cookie。
- 移动端退出、切换账号或返回列表时关闭原生环境；Android 额外验收后台浏览进程确实退出。
- 移动原生地址栏、前进后退、刷新和 URL 协议限制需真实 UI 与网络记录证明。
- 移动清除网站数据和删除环境失败时保留条目；验收必须证明清除 A 后 Cookie/localStorage/IndexedDB 均为空、B 的存储仍保留，再删除 A 并重启主程序确认列表保存。Android 当前 AOSP WebView 不支持较新的 `DELETE_BROWSING_DATA`；改用公开 `ProcessGlobalConfig.setDirectoryBasePaths` 配置每个 UUID 的应用自有数据/缓存根，在浏览进程停止后完整删除该根，且不跟随符号链接。该首个发行预备数据布局仍待真实运行验收，未对此前未发行内部布局完成迁移验收。
- 桌面新增失效上游的 HTTP、WebSocket 和 TLS ClientHello 检查，并用普通直连环境进行对照；`f2f61f4` 的 macOS/Linux 已通过，Windows 完整门禁仍失败。TLS 接收器观察的是连接与握手起始数据，不是受信任 HTTPS 页面内容。
- 进一步完成各平台代理失效的 HTTP/HTTPS/WebSocket、DNS/IPv6 和移动 RTC 边界验证。现有受控 RTC 结果不能扩展为全网络无泄漏。
- Android 正式签名候选仍需实际打包、签名核验和运行验收。已保留公钥证书，新增正式候选的签名指纹匹配及来源记录；已配置签名材料不等于候选已通过。
- iOS 手动设备 ARM64 未签名归档已首次通过，见 [设备候选说明](IOS-DEVICE-CANDIDATE.md)。关闭后恢复同一控制程序前台的修正已在 `a0ddb5c` 的清除与删除流程通过；停代理仍失败。真机签名与分发、macOS 签名公证、Windows 商业代码签名、商店账号和正式审核尚未完成。
- 移动代理核心、桌面内核、字体及全部依赖的随包许可与对应源码交付须完成；保留现有授权记录与第三方文件。
- 移动端新增离线网络组件许可入口，内含固定 sing-box 版本的完整版权声明（含名称/关联限制）、GPLv3 原文和源码链接；这尚不能替代全部传递依赖清单及对应源码交付。
- 网络核心新增源码审阅包生成步骤：包含实际测试提交、Go 应用及绑定工具的模块原始 ZIP、解析后的锁文件与校验清单。`6979216` 已在 Actions 首次生成，含 405 个模块；不覆盖 npm、Pods、Android 依赖和平台 SDK 的完整交付。
- 自动更新新增正式渠道过滤：只接受 `vX.Y.Z`，拒绝草稿、预发布及 `ci-*`/`review-*` 标签；API 不可用时只信任官网 `/releases/latest` 的正式标签跳转，不从订阅流或 HTML 普通链接选新版。下载 URL 限定到本仓库正式标签及所选文件；模块测试及 macOS/Linux 集成已通过，Windows CRLF 适配仍在当前原生流程验证。统一应用版本、正式安装包签名和更新包摘要核验尚需完成。
- 更新包摘要核验已在 `0ddadfa` 的 macOS/Linux Actions 通过：优先取同版本 GitHub 资产 SHA-256，缺少时取对应发布文件的 `.sha256`；缺少有效摘要时不提供自动下载。真实修改后的更新函数验证完整写入、长度与摘要，失败删除文件且不得打开安装器；发布脚本同步生成摘要文件。此完整性检查不替代发行签名或真机运行。
- 五端版本统一取 `apps/universal/src/product.json`，当前为 `1.0.25`、build `2`、`internal-preview`。Expo 的 Android/iOS 元数据、移动界面与桌面 package.version 使用同一记录；保留上游包名避免改变已有用户数据目录。`0ddadfa` 的 Web 配置和 macOS/Linux 实际补丁集成检查通过，Android/iOS 成品版本仍待当前构建确认。
- Mihomo 的既有随包文件误写为 MIT；已按官方 v1.19.32 替换为 GPLv3 原文，Git blob SHA 为 `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`，随包携带来源记录并增加回归检查。这不等于其他依赖或整个应用已完成分发许可审查。

功能和运行门禁通过前不合并发行，不把模拟器 App 称作 iPhone 安装包，不用源码检查替代五平台成品验收。所有产品测试与构建只在 GitHub Actions 执行。
