# 移动引擎下一轮验证决策

需求保持五平台代理连接与独立环境：不能泄漏网站数据、节点凭据或绕过所选线路；现有用户环境和数据不能因换引擎静默丢失。当前 Android document-start 方案的真实空文档反例见[网络边界](MOBILE-NETWORK-BOUNDARIES.md)，不是假设。

2026-11-04 最新终态：[41772782539](https://github.com/lilyco-42/lyco-browser/actions/runs/41772782539) 已真实完成固定源码的优化原生编译，成功保留 AAR。完整原始编译档案 91631272 字节、SHA-256 `583d453e909ebe5cf445109f58c075f08fe79399a4702075545656f055b9bb60`；构建证据档案 151709 字节、SHA-256 `e7b08f5c1109688f307b1732cfbbdbc652961d3a5d56110f0ca90ecba3279b7e`，均完整大小/SHA/CRC 核验。AAR 91629479 字节、SHA-256 `e0b7c7d00055588b2b2cdb312cb15d560ebdff2d9f2550bb6ab26c6f89af837c`；内部 CRC、13 份 x86_64 ELF、补丁仅目标 C++ 文件、优化且无原生调试符号及实际 Maven 发布字节一致均已核对。以下旧记录中“无 AAR/仍构建”仅指各自历史运行。

首个独立消费 [41808267941](https://github.com/lilyco-42/lyco-browser/actions/runs/41808267941) 因消费 POM 的命名空间前缀导致 Gradle 根标签解析失败，尚未运行 RTC 场景。`28a2cd5` 仅保留默认 XML 命名空间并验证依赖子树不变，再用同一成功 AAR 运行 [41810285687](https://github.com/lilyco-42/lyco-browser/actions/runs/41810285687)。该验证已成功完成 29 项检查：[未修改的原始结果](audits/source-engine-runtime-41810285687.json)及[核验来源](audits/source-engine-runtime-41810285687.source.json)绑定完整 101294747 字节 ZIP（SHA-256 `87645469cf52ab8b0afa214d38ac8bece54a59d66c377c5a015368a2955a9f30`）、实际 APK 和来源 AAR。已另行检查完整大小/SHA/CRC、13 份原生库字节、未变的 POM 依赖子树、每个原始网络上下文及事件/SDP/stats。10 个案例中旧构造器原生不存在，9 个适用案例四阶段全部完成；前后直连各有 9 个真实 STUN 与 9 个 TURN 数据确认，健康策略下直接 STUN 为 0、9 个实际 TURN 确认全部经所选代理，停止后 STUN/TURN/消息/回环请求均为 0。健康时 127.0.0.1、::1、localhost 的三次请求均经所选线路成功，前后直连对照也均成功。没有重写原始 RTC 观察或页面策略。

当前结论仅为独立 x86_64 引擎能力通过；实验 APK 为 223967187 字节、SHA-256 `dd1d4dafc21196e2bf03e9c82309f11072f82ae509fdd2d8826aae2c6b39a8f9`，使用一次性实验签名，不是所有者产品包。下一步需在同一门槛下完成 ARM64、产品原生桥接、逐 UUID 的存储隔离与进程关闭、旧环境 Cookie/localStorage/IndexedDB 及不可导出 CryptoKey 迁移验证，保留原环境和失败断言；不得把能力研究替代完整产品、客户线路或 iOS 验收。

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

## 首轮独立原生结果

`286c33e` 的 [40814586112](https://github.com/lilyco-42/lyco-browser/actions/runs/40814586112) 已构建并运行独立 GeckoView159 试验包，实际 `debuggable=false`、target36/min28，与保留的产品 badging 一致；API35 设备未更换。源码使用公开启动前配置，没有网页构造器或原生观测伪装。试验包不是 LYCO 产品，现有环境没有迁移。

真实 IPv4/IPv6/localhost HTTP 正向均成立：前后对照为直连，开启策略时三者实际经所选回环代理，停止代理时没有直接源站访问。RTC 整体 `validProbe=false / passed=false`：前后普通同引擎虽各实际发出54个 STUN，候选为原生 mDNS host，TURN 分配在 coturn 成功但未产生可用 relay 或实际 ACK；不能把策略下零包作为保护通过。此轮不能作为换引擎的依据。

下一轮先让自有 RTC 服务绑定 runner 的真实网络接口，保留真实接收端点与实际 relay 地址，并补齐标准 FINGERPRINT 和原始 ICE 错误观测。没有放宽产品地址/数据包、真实 TURN 通信、回环或断线门禁。当前产品依赖实际为 Expo56/React Native0.85.2；若底层能力成立，还需验证 SDK37.0/AGP9.1+ 与现有产品构建的兼容性，再处理数据迁移，不能依据独立试验直接替换。

## 真实接口试验的原始诊断

[40817257877](https://github.com/lilyco-42/lyco-browser/actions/runs/40817257877) 的 STUN 前后对照各九个适用上下文均为正向，策略下仍零直接 UDP。进一步阅读原始 network.json，直接对照的八个上下文实际已收到 TURN 数据通道 PING/ACK；先前校验器把 Gecko 合法的空候选结束事件误判为非 relay，跨域帧还缺少信令端点的 CORS。修正仅涉及测试端点与事件分类，原始事件完整保留，跨域场景仍要求真实通信。

保护策略下该轮没有实际 TURN TCP 连接和 ACK，因此不能换引擎或宣称网络隔离成立。下一轮保留相同策略、同引擎前后对照、原始候选/SDP/统计及断线负向，增加公开启动环境配置的原生传输日志，以确定没有建立代理通道的原因。

修正后的 [40819289946](https://github.com/lilyco-42/lyco-browser/actions/runs/40819289946) 已获得 `validProbe=true / passed=false`：前后对照全部九个适用上下文（包含跨域帧）真实 TURN TCP PING/ACK 成立，策略及断线均无直接 STUN，三类回环 HTTP 门禁通过；唯一未满足的功能项是策略下真实 TURN TCP 没有连接和 ACK。原生 mtransport 日志记录候选收集立即 `error=10`，尚不能将原因归为 TURN 握手。下一次增加实际命名为 `nicer`、`WebrtcTCPSocket` 的原生日志模块；不改策略或放宽地址、数据包、功能条件。

## 原生默认地址选择与独立修复构建

[40820087794](https://github.com/lilyco-42/lyco-browser/actions/runs/40820087794) 的新增原始 `nicer` 日志已显示 `use only default local addresses: yes`，随后 `failed to find default addresses`，再由 mtransport 返回 error=10；TURN 尚未连接。前后全部九个适用场景的真实 TURN 通信对照有效，不能继续归因于测试 TURN 服务不可用。

已按官方 Gecko159 源码准备受限修复：在强制代理模式使用预取的真实接口来初始化 TURN TCP，避免默认地址查询创建一个被同一策略禁止的 UDP socket。UDP 禁止和代理强制、原始候选/SDP/统计地址检查保持不变；没有媒体权限绕过、假地址或关闭 RTC。确切源码、Maven POM 对应版本与构建限制见[源码试验](../tests/mobile/engine/source/README.md)。

首次完整源构建 [40821252708](https://github.com/lilyco-42/lyco-browser/actions/runs/40821252708) 在原文件摘要匹配后因补丁缺少后续上下文停止，未进入编译。修正后 [40822075594](https://github.com/lilyco-42/lyco-browser/actions/runs/40822075594) 已完成补丁应用和 bootstrap，但未限定路径的格式化修改了无关上游文件，被 diff 空白门禁阻止，仍未进入原生编译。现按官方 `mach format <path/to/file.cpp>` 限定到目标文件，并提前保存改动列表与补丁；原文件/单文件/空白门禁均保持，`53e81b0` 的 [40853280935](https://github.com/lilyco-42/lyco-browser/actions/runs/40853280935) 已启动独立完整构建，尚无通过结论。后续独立原生验收会验证成功构建来源、原生源码无差异、原始 archive/AAR 摘要，以及 APK 每份原生库与 AAR 完全一致，再执行相同通信/泄漏/断线门禁。尚无成功编译产物，接入验证也尚未执行；产品依赖、既有用户环境和下载候选未替换。

2026-11-02 更新：`40853280935` 第二次尝试已由运行器关闭而终止（143）。实时日志修正后的 [41439355235](https://github.com/lilyco-42/lyco-browser/actions/runs/41439355235) 已通过 bootstrap 和原单文件门禁，并实际进入 C++/Rust 编译，仍在 12:19:39Z 收到运行器 shutdown，无 AAR、无编译完成或原生通过证明。日志不足以确定关闭原因；下一轮 [41445348901](https://github.com/lilyco-42/lyco-browser/actions/runs/41445348901) 在保持优化、补丁与原验收门槛的同时限制构建并行度和 Gradle 资源，并实时记录内存、交换空间及进程占用。不得重放已终止运行的旧计划或将该试验内核写入产品依赖。

2026-11-03 复查：`41445348901` 已于 11 月 2 日 14:04:22Z 终止，注释为 hosted runner lost communication。日志 API 两次返回 BlobNotFound，产物列表为空，不能把已记录的运行意图当作存活，也不能认定 OOM 或源码错误。新构建仅改变宿主资源边界：以原非 root 用户在独立 systemd 资源组运行完全相同的源构建，保留至少 2 GiB 内存及部分 CPU 给运行器，先实际验证资源组配置并上传独立预检；组外观察内存事件、峰值和磁盘，失败不退回无限制构建。此举为了取得可用的失败或编译证据，不代表补丁或原生门禁已通过。

宿主预检 `41552388207` 在编译前停止：实现误读 cgroup v2 根目录的 memory.max，实际根目录按内核规范没有此控制文件。修正为核对当前组及祖先的已有上限，同时仍要求实际子组暴露并精确匹配全部内存限制，未加入无限制回退。新 [41552695786](https://github.com/lilyco-42/lyco-browser/actions/runs/41552695786) 重新验证；以实际任务步骤和工件为准，不能据启动状态宣称预检或编译通过。


2026-11-03 后续：资源组预检与 bootstrap、单文件门禁实际成功，但 [41552695786](https://github.com/lilyco-42/lyco-browser/actions/runs/41552695786) 最终因 6 小时时限取消，无 AAR。原始 166000 字节证据 ZIP 的 SHA-256 为 `3d82720b60794229033fb4198eb5afb35144fc4b5d426b11975ecea739b5b931`，完整核验。719 份资源记录中软门槛回收事件约 2606 万次，硬门槛、OOM 和被杀事件均为 0，磁盘仍有至少 76 GB。末段 Rust 进程约 10 GB，内存停顿约 70%；最后打印 gkrust 后没有编译完成证明。不能把此取消改写为补丁编译失败或 OOM。

下一轮只把软门槛从同一硬上限的 85% 调至 95%，保留运行器预留、硬内存、交换空间及 CPU 限额；单并发、优化、补丁与原生验收保持。内核官方说明 memory.high 超限会触发回收和限速，所测软门槛低于实际工作集，因此进行这个受限实验；仍需真实预检、完整编译及原原生用例，不据配置修改宣布修复。
