# 五平台商业发行进度

目标保持为 Windows x64、macOS ARM64、Linux x64、Android、iOS 均具备代理连接与独立浏览环境，再发行。当前 PR：[#31](https://github.com/lilyco-42/lyco-browser/pull/31)。默认下载仍指向 README 中已验收的旧 Windows 预览包。

## 已有证据

| 范围 | 源码提交及 Actions | 证明的范围 |
| --- | --- | --- |
| Windows | `c67433a`，[40340561128](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561128) | 集成门禁及完整 Windows 打包、便携和安装验收通过；不替代后续修改的验收 |
| macOS ARM64、Linux x64 | `6ee44a3`，[40358899770](https://github.com/lilyco-42/lyco-browser/actions/runs/40358899770) | 真实打包应用、真实 Mihomo、两个受管环境、代理流量、Cookie/localStorage 隔离与 A 重开持久化、受控 RTC peer/STUN、退出通过 |
| Go 移动核心 | `c67433a`，[40340561315](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561315) | HTTP、本机认证、停止、SS/VMess/VLESS 实际服务链与 race 检查、Android AAR 和 Apple XCFramework 绑定构建通过 |
| iOS 原生运行 | `c67433a`，[40340561441](https://github.com/lilyco-42/lyco-browser/actions/runs/40340561441) | 编译成功，A/B 流程运行；停代理后本机目标出现直连，整体失败，不能发行 |
| Android 原生运行 | 同上 | Go/JNI 真实请求与网页写入成功；动态网页成功文本与测试驱动的无障碍树不同步，整体失败 |

PR 工作流的 `GITHUB_SHA` 是 GitHub 测试合并提交；报告记录该 SHA，不应误写为分支 head。原始截图、网络记录和报告保留在对应 Actions Artifact，测试不上传身份缓存、账号 JWT 或节点凭据。Billing 使用 CI 夹具；没有真实付款或客户线路验收。

## 正在修复及尚需完成

- iOS 使用显式 loopback 匹配规则，继续保留普通网站全局规则及 `allowFailover=false`，用相同停代理用例验收，不能删除失败断言。
- Cookie 持久化夹具使用 `Max-Age=600`；会话 Cookie 退出浏览器后失效属于正常语义，不将其伪造为永久 Cookie。
- 移动端退出、切换账号或返回列表时关闭原生环境；Android 额外验收后台浏览进程确实退出。
- 移动原生地址栏、前进后退、刷新和 URL 协议限制需真实 UI 与网络记录证明。
- 进一步完成各平台代理失效的 HTTP/HTTPS/WebSocket、DNS/IPv6 和移动 RTC 边界验证。现有受控 RTC 结果不能扩展为全网络无泄漏。
- Android 正式签名候选仍需实际打包、签名核验和运行验收。已配置私有签名材料不等于候选已通过。
- iOS 真机签名与分发、macOS 签名公证、Windows 商业代码签名、商店账号和正式审核尚未完成。
- 移动代理核心、桌面内核、字体及全部依赖的随包许可与对应源码交付须完成；保留现有授权记录与第三方文件。

功能和运行门禁通过前不合并发行，不把模拟器 App 称作 iPhone 安装包，不用源码检查替代五平台成品验收。所有产品测试与构建只在 GitHub Actions 执行。
