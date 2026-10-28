# 紫鸟 / 站斧对标与复用边界

用户明确以紫鸟、站斧浏览器为产品对标，并提出复用 Clash Verge Rev 的内核和界面，再接 Chromium。目标仍是五平台代理连接和独立浏览环境；本记录评估复用路线，不把尚未验收的能力写作已完成。

[紫鸟官方功能说明](https://www.ziniao.com/help/docs/Overview/ziniao-browser-overview/)重点包括独立登录环境、店铺网络、成员权限及操作控制；[站斧官方产品说明](https://www.zhanfubrowser.com/product)包含独立网络、店铺访问与异地协作。这些产品说明用于确定对标项，不替代 LYCO 自己的运行验收。

| 层 | 可复用内容 | 仍需 LYCO 完成与验证 |
| --- | --- | --- |
| 代理 | 当前桌面已经使用 Mihomo；Clash Verge Rev 同样内置 Mihomo，并提供订阅、节点、规则管理 | 每个浏览环境绑定所选线路、并发不串线、失效不直连和权益校验 |
| 管理界面 | 评估复用 Clash Verge Rev 成熟的网络管理交互 | 以环境/店铺列表为首页；节点面板作为网络设置。不能仅复制 UI 后假定后台接口可用 |
| 浏览器 | 当前多环境管理底座、Chromium 用户数据目录和启动流程 | 数据隔离、稳定持久化的指纹、帧/worker 首读一致性、重开和更新兼容性 |
| 账号与商业链路 | lain42.top 现有登录、权益和四档套餐 | 真实付款与客户线路验收，另行核实团队授权、操作记录、环境同步和并发控制 |
| 移动端 | 已有 Android/iOS 原生环境与源码代理核心 | 保留原生隔离与网络门禁，解决 iOS 路由及实际分发条件 |

[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 官方定位为 Windows/macOS/Linux 的 Rust/Tauri 代理客户端；其界面与后台使用自己的宿主接口。Tauri [官方文档](https://v2.tauri.app/reference/webview-versions/)明确使用各平台系统 WebView；管理界面的 WebView 不等于另行启动、按环境隔离的 Chromium 浏览器。

已有候选核对：Clash Verge Rev（GPL-3.0，2026-10-28 读取约 154445 stars）与 [Clash Nyanpasu](https://github.com/libnyanpasu/clash-nyanpasu)（GPL-3.0，约 13250 stars）均是活跃的代理管理参考；它们不直接提供完整的多店铺浏览器产品层。采用其代码须遵守各自许可和保留来源。调研建议继续复用现有浏览器环境能力及 Mihomo，评估移植订阅/节点/规则管理的收益；不因界面参考而整体替换正在验收的宿主，也不把普通 Chromium 多开当作指纹隔离通过证明。

后续最小验证应先在真实 Actions 中证明两个环境各用指定代理、数据互不共享、重开保留身份及断代理无直连，再扩大界面改造。现有长期套餐 P0 保持优先；本评估不等于已完成紫鸟/站斧全部功能。

`7d19d6c` 已实现并验证 [逐环境官网节点绑定](WORKSPACE-ROUTES.md)：三种桌面系统的真实 Mihomo 核心路由通过，Linux 完整成品验收通过，Windows 原生预检的新功能用例通过但后续既有 CPU 配置失败，macOS 原生配置仍被拒绝。当前有明确的功能进展，不等于对标全部完成或五平台可发行。

只读源码核对固定 Clash Verge Rev 提交 `3953e125b223defcec28a3c822c292c743fc1b1e`：[`proxies.tsx`](https://github.com/clash-verge-rev/clash-verge-rev/blob/3953e125b223defcec28a3c822c292c743fc1b1e/src/pages/proxies.tsx) 依赖其数据 provider 和命令层，[`bindings.ts`](https://github.com/clash-verge-rev/clash-verge-rev/blob/3953e125b223defcec28a3c822c292c743fc1b1e/src/services/bindings.ts) 通过 Tauri invoke 读取运行状态、配置代理、管理服务等。故 UI 复用需要适配这些接口；仅更换品牌样式不能自动连接现有 LYCO 后台。未执行该第三方仓库的构建或脚本。
