# 五平台商业发行进度

目标保持为 Windows x64、macOS ARM64、Linux x64、Android、iOS 均具备代理连接与独立浏览环境，再发行。当前 PR：[#31](https://github.com/lilyco-42/lyco-browser/pull/31)。默认下载仍指向 README 中已验收的旧 Windows 预览包。

## 已有证据

| 范围 | 源码提交及 Actions | 证明的范围 |
| --- | --- | --- |
| Windows | `c67433a`，[40340561128](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561128) | 集成门禁及完整 Windows 打包、便携和安装验收通过；不替代后续修改的验收 |
| macOS ARM64、Linux x64 | `cdae6b1`，[40373568947](https://github.com/lilyco-42/lyco-browser/actions/runs/40373568947) | 真实打包应用、真实 Mihomo、两个受管环境、代理流量、Cookie/localStorage 隔离与 A 重开持久化、受控 RTC peer/STUN、退出通过；新增 HTTP/WebSocket/TLS ClientHello 的失效代理检查及真实直连环境对照也通过。macOS 首次因 Electron 下载返回 504 失败，重跑后成功 |
| Go 移动核心 | `cdae6b1`，[40373569000](https://github.com/lilyco-42/lyco-browser/actions/runs/40373569000) | HTTP、本机认证、停止、SOCKS5、SS、VMess、VLESS、Trojan、Hysteria2、TUIC、VMess/VLESS WebSocket、VLESS gRPC 真实服务链及 race 检查通过，Android/Apple 绑定均构建成功 |
| iOS 原生运行 | `f2f61f4`，[40369727206](https://github.com/lilyco-42/lyco-browser/actions/runs/40369727206) | 原生编译、普通测试域名经 Go 核心代理与首个网页写入通过；网址清除不完整且长网址压缩隐藏“前往”按钮，导航失败。此前 `c67433a` 的停代理用例出现本机直连，见 [40340561441](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561441)，该问题仍必须保留回归验收 |
| Android 原生运行 | `cdae6b1`，[40373568817](https://github.com/lilyco-42/lyco-browser/actions/runs/40373568817) | 原生编译、Go/JNI 代理、地址栏/历史/刷新、A/B Cookie 与 localStorage 隔离及 A 重开持久化通过；后台浏览返回控制页时键盘遮挡返回按钮，整体失败。正在验证启动前收起键盘与控制页键盘避让，清除数据和断代理仍未运行 |

同轮 iOS `cdae6b1` 在最初环境名称输入中出现 `mbile-A`，整体失败且未到网页。已将输入组件的初始值固定到该次挂载，程序清空仍使用显式重建；不能把之前的首个网页成功当作当前完整验收。

Windows `6cc4f25` 的 [40362816779](https://github.com/lilyco-42/lyco-browser/actions/runs/40362816779) 在新标签首脚本读到错误 CPU/内存，后续读取才恢复；已加入页面恢复前的最终原生设置，仍须真实内核验证。`f2f61f4` 的 [40369727136](https://github.com/lilyco-42/lyco-browser/actions/runs/40369727136) 通过新增断代理和直连对照后，测试误读了旧直连环境的创建结果，已修正为等待本次创建完成。不能用旧成功记录替代当前版本验收。

PR 工作流的 `GITHUB_SHA` 是 GitHub 测试合并提交；报告记录该 SHA，不应误写为分支 head。原始截图、网络记录和报告保留在对应 Actions Artifact，测试不上传身份缓存、账号 JWT 或节点凭据。Billing 使用 CI 夹具；没有真实付款或客户线路验收。

## 正在修复及尚需完成

- iOS 为显式 loopback 匹配和普通网站全局规则分别创建原生代理配置，均保留 `allowFailover=false`；普通域名与停代理用例都必须通过，不能删除失败断言。
- Cookie 持久化夹具桌面使用 `Max-Age=600`、移动使用 `Max-Age=3600`，覆盖多轮原生驱动启动的测试窗口；会话 Cookie 退出浏览器后失效属于正常语义，不将其伪造为永久 Cookie。
- 移动端退出、切换账号或返回列表时关闭原生环境；Android 额外验收后台浏览进程确实退出。
- 移动原生地址栏、前进后退、刷新和 URL 协议限制需真实 UI 与网络记录证明。
- 移动清除网站数据和删除环境使用原生完整清除接口，失败保留条目；验收必须证明清除 A 后 A 变为空白、B 的存储仍保留。Android 此功能需要系统 WebView 支持 `DELETE_BROWSING_DATA`。
- 桌面新增失效上游的 HTTP、WebSocket 和 TLS ClientHello 检查，并用普通直连环境进行对照；`f2f61f4` 的 macOS/Linux 已通过，Windows 完整门禁仍失败。TLS 接收器观察的是连接与握手起始数据，不是受信任 HTTPS 页面内容。
- 进一步完成各平台代理失效的 HTTP/HTTPS/WebSocket、DNS/IPv6 和移动 RTC 边界验证。现有受控 RTC 结果不能扩展为全网络无泄漏。
- Android 正式签名候选仍需实际打包、签名核验和运行验收。已配置私有签名材料不等于候选已通过。
- iOS 真机签名与分发、macOS 签名公证、Windows 商业代码签名、商店账号和正式审核尚未完成。
- 移动代理核心、桌面内核、字体及全部依赖的随包许可与对应源码交付须完成；保留现有授权记录与第三方文件。
- 移动端新增离线网络组件许可入口，内含固定 sing-box 版本的完整版权声明（含名称/关联限制）、GPLv3 原文和源码链接；这尚不能替代全部传递依赖清单及对应源码交付。
- 网络核心新增源码审阅包生成步骤：包含实际测试提交、Go 应用及绑定工具的模块原始 ZIP、解析后的锁文件与校验清单。实现仍待 Actions 首次生成确认，且不覆盖 npm、Pods、Android 依赖和平台 SDK 的完整交付。
- 自动更新新增正式渠道过滤：只接受 `vX.Y.Z`，拒绝草稿、预发布及 `ci-*`/`review-*` 标签；API 不可用时只信任官网 `/releases/latest` 的正式标签跳转，不从订阅流或 HTML 普通链接选新版。下载 URL 限定到本仓库正式标签及所选文件；仍待新一轮 Actions 验证。统一应用版本、正式安装包签名和更新包摘要核验尚需完成。
- Mihomo 的既有随包文件误写为 MIT；已按官方 v1.19.32 替换为 GPLv3 原文，Git blob SHA 为 `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`，随包携带来源记录并增加回归检查。这不等于其他依赖或整个应用已完成分发许可审查。

功能和运行门禁通过前不合并发行，不把模拟器 App 称作 iPhone 安装包，不用源码检查替代五平台成品验收。所有产品测试与构建只在 GitHub Actions 执行。
