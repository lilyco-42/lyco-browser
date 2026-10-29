# 五平台商业发行进度

目标保持为 Windows x64、macOS ARM64、Linux x64、Android、iOS 均具备代理连接与独立浏览环境，再发行。当前 PR：[#31](https://github.com/lilyco-42/lyco-browser/pull/31)。默认下载仍指向 README 中已验收的旧 Windows 预览包。

## 已有证据

移动 `655e071` 新增[环境保存官网线路](MOBILE-WORKSPACE-ROUTES.md)：账号归属、保存所选节点、重开保留选择、缺失节点拒绝回退及版本封装已实现。新增策略/迁移单元、类型和 Web 回归 [40676034809](https://github.com/lilyco-42/lyco-browser/actions/runs/40676034809) 通过；签名 Android [40676041190](https://github.com/lilyco-42/lyco-browser/actions/runs/40676041190) 原有完整原生验收通过，APK SHA-256 `338718ad3c29a51599579af12b5c7ef2ea8bc321de35485704e39227d35637f5`。新增官网绑定 [40709909923](https://github.com/lilyco-42/lyco-browser/actions/runs/40709909923) 对同一未修改签名 APK 完成整组 12 项与 7 份实际 TCP/三类存储观察：重启恢复、缺失/断线不回退且 B 可用、换线保留数据、跨账号隐藏、旧版拒绝覆盖、恢复安装和原生撤权均通过；绑定/降级/恢复元数据摘要一致。iPhone [40677110486](https://github.com/lilyco-42/lyco-browser/actions/runs/40677110486) 设备编译成功，IPA SHA-256 `27e87797aabd8a74edbc22bbb27c7cb72225e08dc35d4d482d7d1a137133ab92`；未签名、不可直接安装、无真机证明。

**Android RTC 已有明确失败证据。** 同一 `655e071` APK 的原生 [40715613765](https://github.com/lilyco-42/lyco-browser/actions/runs/40715613765) 对照有效：API35/WebView124 前后普通 WebView 均实际发出 STUN；产品健康和断上游时也各发出直接 UDP，并提供设备 IPv4/IPv6 host 候选。`8079491` 的 document-start 修复已随 `ced08fe` 原签名包完成 [40721798567](https://github.com/lilyco-42/lyco-browser/actions/runs/40721798567) 原有原生回归；扩展 [40724556782](https://github.com/lilyco-42/lyco-browser/actions/runs/40724556782) 对照有效但仍失败：真实 TURN TCP 数据通道经所选代理、断线无 TURN 直连回退，六类上下文有实际 relay 约束；初始 about:blank 及嵌套空帧仍绕过，健康/断线上游各两次实际 STUN，原生事件、SDP 和统计均有设备地址。所选 HTTP/TURN 线路通过不能抵消此反例。细节见[移动网络边界](MOBILE-NETWORK-BOUNDARIES.md)。

同一 `ced08fe` APK 的官网绑定 [40724969665](https://github.com/lilyco-42/lyco-browser/actions/runs/40724969665) 整组12项、7份实际 TCP/三类存储观察成功，包含实际旧版升级/降级拒绝覆盖、恢复安装及原生撤权。实际 APK129825587字节，SHA-256 `3b8ba20629c1f8d9d0661318740938c31ab7225f4624fde5b91e1be6c9995038`；APK 内策略资产与源码逐字节匹配，仅内部诊断，RTC 失败结论不变。

最新桌面 `81e44f7` / `1bd475a` 新增环境列表绑定线路及直接管理入口，换线同步更新，退出清除。`1bd475a` [40824878548](https://github.com/lilyco-42/lyco-browser/actions/runs/40824878548) 三平台核心路由成功，Linux/macOS 实际成品各 14 项、线路 6 项和 7 个网页观察通过，包括真实认证链路、存储、失效与退出。前一轮 [40823657281](https://github.com/lilyco-42/lyco-browser/actions/runs/40823657281) macOS 原生配置拒绝仍保留；本轮未修底层身份逻辑，不能据单次成功宣布兼容稳定性问题解决。Windows 原生仍未通过，详见[逐环境线路](WORKSPACE-ROUTES.md)。

此前桌面源码 `e5ed180` 修复 [固定节点链式依赖](WORKSPACE-ROUTES.md)：[40671514856](https://github.com/lilyco-42/lyco-browser/actions/runs/40671514856) 三平台各 54 个单元门禁、5 个普通及 8 个真实链路检查成功。Linux [40671776959](https://github.com/lilyco-42/lyco-browser/actions/runs/40671776959) 完整成品 14 项成功，新增线路 5 项、7 个网页观察覆盖中转失效/恢复、出口失效、B 不受影响和存储保留。新内部归档 SHA-256 `358b88196047cec4473c54871785b1d9cb970d56bbccc763a9b77d16ac20b582`，草稿 `ci-e5ed18067c7a`。本轮 macOS 仍在原有硬件/显卡拒绝处失败，未到链式浏览；Windows [40671781496](https://github.com/lilyco-42/lyco-browser/actions/runs/40671781496) 完成选线控件检查，但首个选线浏览器启动被拒绝，零个新网页观察，最后 CPU 匹配 false。便携/安装阶段未执行；整体五平台发行未通过。`20a4e7a` 的 [40667060362](https://github.com/lilyco-42/lyco-browser/actions/runs/40667060362) macOS 默认配置曾通过完整普通用例，已保存原始报告，不能用该历史成功替代本轮失败或宣称兼容问题已解决。

此前桌面新功能 `7d19d6c` 已完成 [逐环境官网节点绑定](WORKSPACE-ROUTES.md)：[40641905733](https://github.com/lilyco-42/lyco-browser/actions/runs/40641905733) 三平台真实 Mihomo 核心路由通过，Linux 完整 14 项成品检查通过，含实际菜单选线、A/B 并行隔离、重开、失效负向及界面换线后数据保留。新 Linux 归档 SHA-256 `ca50995bd9c216f50b7a8adbb1b5a08994fe5f64ea42b0311a2849e2937b5fcc`，仅保存在未发布草稿 `ci-7d19d6c49518`。Windows [40641909641](https://github.com/lilyco-42/lyco-browser/actions/runs/40641909641) 原生预检的新功能四项通过，随后旧自定义 CPU 配置失败、没有预期受管请求，成品阶段未执行。macOS 同轮被原生配置拒绝，未到达新用例。三个新运行均已结束，整体发行仍未通过。以下记录保留各自具体源码和范围，不能扩大为当前全部平台通过。

此前内部候选：Android `aaec002` [40630265066](https://github.com/lilyco-42/lyco-browser/actions/runs/40630265066) 全部成功，保留证书、成品版本、原生完整存储/导航/进程/代理正负向及许可页均通过；APK SHA-256 `97f5a04cfe255cef00519fb673274565e5fde4156f771849466b610b601fcf74`。包含新周期名称及统一套餐入口，周期会员界面采用隔离 Billing 夹具验证，无真实付款。扩展 `f31b3ef` [40631526879](https://github.com/lilyco-42/lyco-browser/actions/runs/40631526879) 同步四档文案/购买页，真实 Chromium 全套验收通过；ZIP SHA-256 `815955e16a66ac29c7a27546b2c27d55fd5047751913c878edfbd16461c0c362`。两者均为内部候选，未正式发行。

Linux `fa40538` [40633763490](https://github.com/lilyco-42/lyco-browser/actions/runs/40633763490) 的完整 13 项验收通过，新增随包 OFL 中文字体、实际加载与不同字形检查；原始工作台和 120 天账户截图人工复核中文可读。归档 SHA-256 `7d61d019e9faf56e18f3ad137de838605b19b6cabd8b302e5c43260f9f75bb7c`，仅保存为未发布内部候选。旧 `f3f08b3` 中文方框包继续标记为诊断用。详见 [工作台字体](WORKBENCH-FONT.md)。同轮 macOS 字体与三周期显示通过，随后仍被原生硬件/显卡配置拒绝，整个 Unix 工作流因此失败。Windows `bd6b19f` [40634181774](https://github.com/lilyco-42/lyco-browser/actions/runs/40634181774) 已结束：修正许可文件换行后预检 52 项成功，便携成品字体及三周期显示通过；但 B 首次启动无浏览器观察，最后原生 CPU 匹配回执为 false，便携验收失败（此前 29 项通过），安装版验收未执行，完整版本不可发行。此前 Windows [40630476020](https://github.com/lilyco-42/lyco-browser/actions/runs/40630476020) 三周期显示通过，但未观察到受管浏览器验证请求，回执 CPU 不符且环境停止，整体失败。iPhone `aaec002` 设备归档 [40630268094](https://github.com/lilyco-42/lyco-browser/actions/runs/40630268094) 已成功：iPhoneOS ARM64、SDK26.5、最低iOS17、版本1.0.25/build2及离线JS；IPA SHA-256 `ed73486127b9a6cef89fa65e94966cc8498f31ecc5ebc2f71f25edbf66bb4386`。未签名、没有 provisioning profile、不能直接安装，没有真机运行/代理通过证明。

`aaec002` 修正客户端长周期套餐显示与购买入口：桌面和移动端根据所购 SKU 显示季卡、120天套餐、年卡，保留规范服务码授权和凭据边界。共享界面与单元回归 [40630059374](https://github.com/lilyco-42/lyco-browser/actions/runs/40630059374) 成功，使用隔离 Billing 夹具，无真实付款。以上 Android、iPhone 归档及旧桌面运行均已结束，具体结论见前文。桌面 feature 分支手动构建仅保留未发布草稿；main 原有发布行为保持。

最新 iOS 独立研究 `7e2b596` [40608302339](https://github.com/lilyco-42/lyco-browser/actions/runs/40608302339) 完成有效直连对照及 22 个观察：7 种公开代理配置均未通过，14 次本机健康/停止目标仍直连。首次冷启动对照实际加载原内容用时 5.94 秒；只延长该正向对照等待，代理正负向预算和内容/网络断言保持。`40552699850` 的首次对照超时，不应把那轮作为完整对照证据。官方新内核元数据只读检查 [40607913901](https://github.com/lilyco-42/lyco-browser/actions/runs/40607913901) 返回 HTTP403；这不是内核可用性或功能验收成功。

`5a55b17` 的离线 JavaScript 许可页已通过 [40553867714](https://github.com/lilyco-42/lyco-browser/actions/runs/40553867714)：六项生成器测试、TypeScript、Expo Web 导出和真实浏览器断网搜索/展开原文/关闭。实际安装包 501 项，35 项补入精确版本上游原件，缺少文本从 41 项降为 3 项；见 [版权交付记录](THIRD-PARTY-DELIVERY.md)。`75b0d55` 的新签名 Android 内部候选 [40554474153](https://github.com/lilyco-42/lyco-browser/actions/runs/40554474153) 已全部成功：保留证书匹配、成品版本、完整 A/B 存储/导航/清除/删除/重启/进程退出/代理正负向，以及新增许可页实际打开/搜索/展开原文/关闭均通过。6 份预期存储报告，5 次导航，停代理后 C 源站请求为 0。APK SHA-256 `cf42a2d4a193ddd31ccc5763da3c06666440442e4b38cc02ffa434c7d4732398`，签名证书仍为 `1a5407a3cdea1bef835214d0f97d4e94952c69c10b45c1c7573c8f6691297bae`。这不是商店、真机客户线路或五平台正式发行证明。

新增 [移动 JS 来源审计](NATIVE-JS-INVENTORY.md)：`a7e7a6c` [40635942712](https://github.com/lilyco-42/lyco-browser/actions/runs/40635942712) 两平台和七项解析回归通过，各观察到 28 个 npm 包，三项缺原文包未出现在此次独立导出的来源映射中。不是签名 APK/IPA 或全部原生组件的交付证明。用户明确紫鸟/站斧对标后的复用建议见 [产品对标记录](PRODUCT-BENCHMARK.md)，尚未整体更换宿主。

2026-10-28 补查：`72c6753` 的 Windows [40496745914](https://github.com/lilyco-42/lyco-browser/actions/runs/40496745914) 和 macOS [40496746024](https://github.com/lilyco-42/lyco-browser/actions/runs/40496746024) 在实际启动时拒绝不符的硬件/显卡回执；同一 Unix 运行的 Linux 任务通过。拒绝是保护行为，不是配置组合已修复。移动 [40496745927](https://github.com/lilyco-42/lyco-browser/actions/runs/40496745927) 的 Android 第一次尝试在模拟器下载损坏（`Error on ZipFile unknown archive`）阶段停止，未执行原生用例；第二次尝试已通过完整 Android 原生验收，6 份预期存储报告、5 次导航，停代理后 C 源站请求为 0。该 PR 预览未断言保留发行签名，不能替代已签名候选。iOS 的原生负向仍失败，不能将 Android 基础设施错误解释为应用回归，亦不能把旧候选成功扩展到当前全部平台。

`92ddbd7` 的核心 [40550598220](https://github.com/lilyco-42/lyco-browser/actions/runs/40550598220) 已通过整个 `go test -race -tags with_quic,with_utls -count=1 ./...`。新增用例通过认证 HTTP 和 SOCKS5 两种入站，实际连接 IPv6 HTTP、验证 CI CA 的 HTTPS、远端域名 HTTPS/WSS；共 8 次源站访问均经过指定上游。停止上游后相同 8 次请求全部失败，源站访问数保持不变；随后 3 次独立直连成功证明源站仍可达。此结果只证明 Go 核心的边界，不能替代 WebView/WKWebView、设备 DNS/RTC、客户线路或全设备 VPN 验收。该次仅重跑核心测试，未重编未变更的原生绑定。

独立套餐 P0 已于 2026-10-28 部署到 [lain42.top](https://lain42.top/vpn/#plans)：月卡 299/30天、季卡 852/90天、120天套餐 1136/120天、年卡 3050/365天。后端 [studio-billing#1](https://github.com/lilyco-42/studio-billing/pull/1) 与网站 [#32](https://github.com/lilyco-42/lyco-browser/pull/32) 保持草稿，源码与数据库已在服务器私有目录备份。未发起真实付款，商城原有爱发电充值核验异常提示仍存在；该 P0 不代表浏览器五平台已发行。

| 范围 | 源码提交及 Actions | 证明的范围 |
| --- | --- | --- |
| Windows | `0ddadfa`，[40455032137](https://github.com/lilyco-42/lyco-browser/actions/runs/40455032137) | 整体成功：预检 49、便携包 49、安装版 48 及安装/图标/快捷方式/卸载 6 项通过；三次普通新标签、恢复会话与首脚本 CPU/内存保持严格，含受控 RTC、HTTP/WebSocket/TLS 断代理与直连对照。新候选只存为未发布草稿，尚不作为全平台正式版 |
| Windows 后续独立构建 | `afbd179`，[40486858031](https://github.com/lilyco-42/lyco-browser/actions/runs/40486858031) | 新标签首脚本再次读到 CPU 4、内存 8，配置期望 6/4，预检失败；稍后读取变成 6/4，但原生 getFingerprint 中仍不匹配。表明此前单轮成功不能证明竞争已彻底修复，继续阻止当前版本发行。新增只含固定字段类型及匹配布尔值的协议回执观察，保持原始首读断言 |
| Windows 成品版本及安装运行 | `0aa95b1`，[40488997798](https://github.com/lilyco-42/lyco-browser/actions/runs/40488997798) | 原生预检和便携版通过，实际运行版本与随包清单一致；安装版在普通新标签的首脚本读到内存 8、期望 4，严格断言失败。实际 A 环境的原生写入请求与声明配置一致，但写入回执及随后 getFingerprint 的硬件字段已不匹配；其他环境的匹配回执不能证明 A 成功，当前版本禁止发行 |
| Windows 最小 SDK 顺序研究 | `b7ef7a9`，[40494532652](https://github.com/lilyco-42/lyco-browser/actions/runs/40494532652) | 不含产品脚本的 6 个新页面案例，初始化前/后写入及附加 CPU override 均正确返回、读取和首读非默认硬件值。尚未证明完整应用可用；继续分别加入原生语言/显卡声明和启动 persona 参数定位差异 |
| Windows 原生显卡与硬件组合 | `82f6a38`，[40495755896](https://github.com/lilyco-42/lyco-browser/actions/runs/40495755896) | 20 个最小案例确认：原生显卡设置触发 CPU/内存 4/8，语言/时区和启动参数本身不触发。重发完整身份和仅补写硬件字段均未修复。噪声种子、语言、时区及显卡仍保留。`e4ad769` 增加产品回执核验，不符即阻止启动；这不等于已经支持该自定义组合，仍待完整验收 |
| macOS ARM64、Linux x64 | `0ddadfa`，[40455032067](https://github.com/lilyco-42/lyco-browser/actions/runs/40455032067) | 真实打包应用、Mihomo、两个受管环境、代理流量、Cookie/localStorage 隔离与 A 重开、受控 RTC peer/STUN、退出、HTTP/WebSocket/TLS ClientHello 失效代理检查及真实直连环境对照通过；实际更新器的完整性拦截、桌面应用版本与随包版本清单也通过 |
| Go 移动核心与源码包 | `6979216`，[40376368484](https://github.com/lilyco-42/lyco-browser/actions/runs/40376368484) | HTTP、本机认证、停止、SOCKS5、SS、VMess、VLESS、Trojan、Hysteria2、TUIC、VMess/VLESS WebSocket、VLESS gRPC 真实服务链及 race 检查通过；Android/Apple 绑定成功，源码审阅包首次保留了 405 个应用和绑定工具模块 |
| iOS 原生运行 | `a0ddb5c`，[40451827758](https://github.com/lilyco-42/lyco-browser/actions/runs/40451827758) | 地址栏/历史/刷新、A/B Cookie/localStorage/IndexedDB 隔离及 A 重开、清除 A 后三项为空且 B 保留、删除 A 并重启确认列表均通过；停代理后的 C 仍请求本机源站并完成三项写入，严格负向失败，禁止发行 |
| iOS 最小原生代理研究 | `c5a6a83`，[40491562899](https://github.com/lilyco-42/lyco-browser/actions/runs/40491562899) | 独立 UIKit/WKWebView 程序完成 19 个观察：6 种 HTTP/SOCKS5/域名配置的普通域名均经代理；健康及停止状态下的 127.0.0.1 目标均直连，包括 allowFailover=false。无 Expo 或产品指纹脚本；研究失败不是产品验收通过，下一步区分代理地址排除与一般回环排除 |
| iOS 不同代理地址对照 | `c066a0f`，[40494805956](https://github.com/lilyco-42/lyco-browser/actions/runs/40494805956) | 22 个观察中，代理地址改为 ::1 后普通域名仍经代理，而 127.0.0.1 源站在健康/停止状态仍直连。环境为 iOS 26.4 模拟器 / iPhone 17 Pro、SDK 26.5；仅此运行范围，不推断所有 iOS 版本或真机表现 |
| Android 正常预览 | `afbd179`，[40486858035](https://github.com/lilyco-42/lyco-browser/actions/runs/40486858035) | 首次完成新数据根布局的完整原生运行：A/B 三项存储隔离、重开、后台进程退出、清除 A 保留 B、删除与重启、真实代理和停代理负向均通过；源站有 6 份预期报告，C 请求为 0 |
| Android 已签名候选 | `0aa95b1`，[40489237355](https://github.com/lilyco-42/lyco-browser/actions/runs/40489237355) | 实际 APK 签名匹配保留证书；编译成品标识、1.0.25 / build 2 及完整原生运行均通过。APK SHA-256：`7226766a75ae24dda081a3a56a68ae75db7497f2e1ccd2e60078a188cc6c2cd6`。证书 SHA-256：`1a5407a3cdea1bef835214d0f97d4e94952c69c10b45c1c7573c8f6691297bae`。未上架或作为全平台正式版发布 |
| iPhone ARM64 设备编译 | `a0ddb5c`，[40451856981](https://github.com/lilyco-42/lyco-browser/actions/runs/40451856981) | 首次使用 iPhoneOS SDK 26.5 构建并归档成功，主程序 Mach-O 平台为 IOS、最低版本 17，Payload 内有设备程序和离线 JS；无 provisioning profile、不能直接安装、未做真机运行验收。IPA SHA-256 为 `6484675c5e50cfc504c705fcbb8309ef416df3e0e6cc8522d6ccc9db91f6f6fc` |
| iPhone 设备成品版本 | `0aa95b1`，[40489275355](https://github.com/lilyco-42/lyco-browser/actions/runs/40489275355) | 实际 iPhoneOS ARM64 成品 Info.plist 为 top.lain42.lycobrowser、1.0.25 / build 2，含离线 JS；未签名、不可直接安装、没有真机运行证明。IPA SHA-256：`22dc14256e9a5ad2dc35276c607670a8671c9073b16da4e40b033d2750bb9fd3` |

Windows 当前成功源码 head 为 `0ddadfa`，实际测试合并提交为 `59b8fd686452651c0192b0f6aa20fa545d282924`；[未发布候选](https://github.com/lilyco-42/lyco-browser/releases/tag/review-59b8fd686452-40455032137-1) 的 EXE SHA-256 为 `2c252dff9b10429874831d555063e267436bfe535e73834f330fc308876f0f94`，ZIP 为 `ca110d47fa085a614164a01660480640b0b8fa77ad26588af2c8634e90e0b192`。前一 `a0ddb5c` 运行的原生阶段也已通过，但草稿保存曾被 GitHub 403 拒绝，不能写作整体成功；此后运行已实际保存候选。iOS 的新证据确认三项存储清除与 B 保留，同时再次确认本机直连问题，不能删除失败断言或以存储成功宣称整体通过。

PR 工作流的 `GITHUB_SHA` 是 GitHub 测试合并提交；报告记录该 SHA，不应误写为分支 head。原始截图、网络记录和报告保留在对应 Actions Artifact，测试不上传身份缓存、账号 JWT 或节点凭据。Billing 使用 CI 夹具；没有真实付款或客户线路验收。

## 正在修复及尚需完成

- iOS 显式 loopback 与普通网站双 HTTP 规则在 `a0ddb5c` 的本机负向中失败；改为公共 SOCKS5 API 后，`afbd179` 同样通过普通网页、三项存储清除和删除，但停代理仍访问本机源站，整体失败。普通域名与停代理原生用例继续使用原断言。独立研究及不同代理地址对照均确认代理健康时也绕过本机目标，不能靠更换 IPv4/IPv6 代理地址宣称解决；不以研究代替产品验收。
- Windows 最小 SDK 复现已定位原生显卡设置与自定义硬件的冲突。测试值特意不同于生成身份的默认值；不注入产品指纹脚本，不导出完整身份或凭据。公开 `/json/protocol` 确认该固定内核使用平面可选整数硬件字段，不能据其他版本的 identityId/overrides 格式擅自迁移。产品新增回执拒绝和缓存保留检查；仍需真正支持配置组合并通过完整应用门禁。
- 公共 SOCKS5 配置已有成熟实现先例：[OnionBrowser Tab.swift](https://github.com/OnionBrowser/OnionBrowser/blob/ed3324efc87b39a332f68e8853347be82c1cd4c2/OnionBrowser/Browsing/Tab.swift) 与 [Apple ProxyConfiguration](https://developer.apple.com/documentation/network/proxyconfiguration)。LYCO 继续复用自己的源码代理核心及公开 API，不改为自造 HTTP/HTTPS 加载器，不改变原有负向页面或期望。先例只支持技术选择，不能替代本应用运行结果。
- Cookie 持久化夹具桌面使用 `Max-Age=600`、移动使用 `Max-Age=3600`，覆盖多轮原生驱动启动的测试窗口；会话 Cookie 退出浏览器后失效属于正常语义，不将其伪造为永久 Cookie。
- 移动端退出、切换账号或返回列表时关闭原生环境；Android 额外验收后台浏览进程确实退出。
- 移动原生地址栏、前进后退、刷新和 URL 协议限制需真实 UI 与网络记录证明。
- 移动清除网站数据和删除环境失败时保留条目；Android 已签名候选和 iOS 模拟器已证明清除 A 后 Cookie/localStorage/IndexedDB 均为空、B 的存储仍保留，再删除 A 并重启主程序确认列表保存。Android 当前 AOSP WebView 不支持较新的 `DELETE_BROWSING_DATA`；改用公开 `ProcessGlobalConfig.setDirectoryBasePaths` 配置每个 UUID 的应用自有数据/缓存根，在浏览进程停止后完整删除该根，且不跟随符号链接。该首个发行预备布局已验收；未对此前未发行内部布局完成迁移验收。
- 桌面新增失效上游的 HTTP、WebSocket 和 TLS ClientHello 检查，并用普通直连环境进行对照；`0ddadfa` 的三个桌面平台均已通过。TLS 接收器观察的是连接与握手起始数据，不是受信任 HTTPS 页面内容。
- 进一步完成各平台代理失效的 HTTP/HTTPS/WebSocket、DNS/IPv6 和移动 RTC 边界验证。现有受控 RTC 结果不能扩展为全网络无泄漏。
- Android 使用保留密钥签名的内部候选已在 `40489237355` 实际完成打包、签名指纹匹配、原生成品版本检查及完整运行验收；仍需商店或独立分发流程、客户线路与真实商业链路核验，不等于全平台发行完成。
- iOS 手动设备 ARM64 未签名归档已首次通过，见 [设备候选说明](IOS-DEVICE-CANDIDATE.md)。关闭后恢复同一控制程序前台的修正已在 `a0ddb5c` 的清除与删除流程通过；停代理仍失败。真机签名与分发、macOS 签名公证、Windows 商业代码签名、商店账号和正式审核尚未完成。
- 移动代理核心、桌面内核、字体及全部依赖的随包许可与对应源码交付须完成；保留现有授权记录与第三方文件。
- 移动端新增离线网络组件许可入口，内含固定 sing-box 版本的完整版权声明（含名称/关联限制）、GPLv3 原文和源码链接；这尚不能替代全部传递依赖清单及对应源码交付。
- 网络核心新增源码审阅包生成步骤：包含实际测试提交、Go 应用及绑定工具的模块原始 ZIP、解析后的锁文件与校验清单。`6979216` 已在 Actions 首次生成，含 405 个模块；不覆盖 npm、Pods、Android 依赖和平台 SDK 的完整交付。
- 自动更新新增正式渠道过滤：只接受 `vX.Y.Z`，拒绝草稿、预发布及 `ci-*`/`review-*` 标签；API 不可用时只信任官网 `/releases/latest` 的正式标签跳转，不从订阅流或 HTML 普通链接选新版。下载 URL 限定到本仓库正式标签及所选文件；`0ddadfa` 三个桌面平台的更新集成及 Windows CRLF 适配已通过。正式安装包签名仍需完成。
- 更新包摘要核验已在 `0ddadfa` 的 macOS/Linux Actions 通过：优先取同版本 GitHub 资产 SHA-256，缺少时取对应发布文件的 `.sha256`；缺少有效摘要时不提供自动下载。真实修改后的更新函数验证完整写入、长度与摘要，失败删除文件且不得打开安装器；发布脚本同步生成摘要文件。此完整性检查不替代发行签名或真机运行。
- 五端版本统一取 `apps/universal/src/product.json`，当前为 `1.0.25`、build `2`、`internal-preview`。Expo 的 Android/iOS 元数据、移动界面与桌面 package.version 使用同一记录；保留上游包名避免改变已有用户数据目录。`0aa95b1` 的已签名 APK 实际 aapt badging、iPhone 成品 Info.plist 及 Windows 预检/便携包运行版本均通过；macOS/Linux `477817b` 的实际打包应用版本也已通过 [40493218400](https://github.com/lilyco-42/lyco-browser/actions/runs/40493218400)。安装版 Windows 的首读失败和 iOS 路由失败仍阻止整体发行。
- Mihomo 的既有随包文件误写为 MIT；已按官方 v1.19.32 替换为 GPLv3 原文，Git blob SHA 为 `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7`，随包携带来源记录并增加回归检查。这不等于其他依赖或整个应用已完成分发许可审查。

功能和运行门禁通过前不合并发行，不把模拟器 App 称作 iPhone 安装包，不用源码检查替代五平台成品验收。所有产品测试与构建只在 GitHub Actions 执行。

Android 后续原生引擎试验尚不改变上面的产品状态：Gecko159 独立实验 [40820087794](https://github.com/lilyco-42/lyco-browser/actions/runs/40820087794) 已取得有效前后对照，九个适用上下文真实 TURN TCP 通信均成立；强制代理时因默认地址选择失败而没有实际 TURN 连接，因此仍未满足功能要求。受限原生源码修复正单独构建，完成后仍需验证最终 APK 确实装入该库并通过原有全部原生门禁。详见[移动引擎决策及实际失败](MOBILE-ENGINE-PREFLIGHT.md)。
