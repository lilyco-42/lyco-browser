# 第三方版权与源码交付

新增的 Android 核心组件源码留存已有真实 [Actions 41882642428](https://github.com/lilyco-42/lyco-browser/actions/runs/41882642428) 的局部成功证据：两种架构的实际 Go 编译输入各 13 份及原锁文件均保留，编译前后输入未变，实际输出与 AAR 两份 ELF 库逐字节一致；另保存 266 份 Java/Go/Cgo 工作源码、工具原始构建信息和实际 NDK 修订。完整组件 ZIP 808543847 字节、SHA-256 `390085da933cd3950edc26374f560e5bd4dbca6cf710b34ac1e63068b9c2696b`，完整收据 ZIP 589699 字节、SHA-256 `21f905b06d66efa04934075e83a5f2214cc2fc58774491e4562072d597ce88c4`，均已独立大小/SHA/CRC 核验。两份实际 ELF 的内嵌 Go 信息与原始记录一致，`vcs.modified=true` 保留。父源码包包含真实受测合并提交 `6b83a382510b0f0602161a1a77d8568a9105c368` 的全部 404 份受跟踪文件、405 个依赖原始 ZIP；全部内层 CRC、逐文件 SHA 以及 Go 模块和 go.mod 校验和均核对。见[未修改原始清单](audits/android-generated-bindings-41882642428.json)和[独立核验记录](audits/android-generated-bindings-41882642428.source.json)。

核验同时发现外层 `go.sum` 在下载绑定工具依赖后增加 380 条校验记录，与实际编译时的摘要不同；原始编译锁仍在嵌套生成源码包中，两种架构一致，外层也保留原有全部行。打包修正改为直接复制原始编译锁并核对两种架构，不能追认旧档案外层锁完全一致。该次 Android 工作通过，Apple 工作取消、整体工作流失败，不算全平台通过。

修正后的 [41941420955](https://github.com/lilyco-42/lyco-browser/actions/runs/41941420955) 组件构建已成功。完整组件 ZIP 808532959 字节、SHA-256 `b23a8c9072045ae703ae75ee71efa680e5c6a3ab4dbbcdb30e50e2a30e9871d6`，收据 ZIP 589957 字节、SHA-256 `d0d2006a043f0843ceeadd0fae94d844a38a9719f7e20535d5ea80a9f941c779`，均完整大小/SHA/CRC 核验。对这份变化后的产物重新核验实际库和两份编译收据、266 份工作源码、嵌套归档、全部 406 份受测合并提交文件，以及 405 个模块 ZIP 的 55988 条目 CRC、SHA 和 Go 校验和；外层两份锁文件现与两种架构的实际编译输入逐字节一致，额外校验行为零。真实受测合并提交为 `798999b09f1d389d0cdd374312c2066223db9010`，不冒充 PR 头提交。[未修改的新清单](audits/android-generated-bindings-41941420955.json)和[独立核验记录](audits/android-generated-bindings-41941420955.source.json)保留原件关系。该次 Apple 组件工作也通过，但没有启用 Apple 生成源码收集，未据此验证其全部原件、安装包或运行行为。

仅 Android 组件任务启用生成源码收集，产品默认构建不启用，原 Go/代理运行与平台构建门槛保留。具体实现和限制见[核心源码留存](../mobile/core/README.md#generated-binding-inputs)。这些证据不证明旧 `4dc38db` 签名 APK 的生成源码、可重现构建、Apple/全部 SDK/NDK 源码与许可或完整商业交付。原三项 npm 原文缺口及其他依赖审查保留。

离线 Go 声明的完整核心版本校验曾因新增收集工具和说明文件而拒绝旧的核心树关联；原校验器和门槛均保留。[只读复核 41945034941](https://github.com/lilyco-42/lyco-browser/actions/runs/41945034941) 使用已成功的 [85c652c 组件 41942598583](https://github.com/lilyco-42/lyco-browser/actions/runs/41942598583)：在 Actions 中完整核验两份组件/收据 ZIP 的大小、SHA 和 CRC，读取两份真实 ELF 的 Go 构建信息，要求整个当前核心树与实际受测合并提交相同，再验证实际 72 项依赖、全部原始模块 ZIP/go.mod 校验和及 104 份原文。下载后的 32174 字节复核 ZIP（SHA-256 `77480260b24d69d406470f3ada8a727ac4c3e395c36a0369629d782b777c2961`）也已另行完整核验；两份实际依赖图及 72 份 ZIP/go.mod 摘要均与此前保留的原件一致。

[原始复核报告](audits/go-notices-core-binding-41945034941.json)和[来源记录](audits/go-notices-core-binding-41945034941.source.json)绑定真实受测合并提交 `513e7a327e6f5e8764a60ab03d297342a0eb27bf`、完整核心树 `22e63f5e223f6466858f77be9516a3c2c680e0e4` 及生成描述文件。该描述文件原字节接入，原目录数据摘要 `8dd661c8…`、72/104 原文、Go 锁文件及原始收集身份不变。完整离线声明仍由原任务独立验收；这份组件复核不等于当前签名 APK 的对应源码、运行验收或全部许可审查通过。

## 已有授权与交付范围

[README 的 2026-10-17 记录](../README.md)已保存产品所有者的明确确认：既有 Wayfern 书面授权涵盖 LYCO 运行、分发及随包 Windows/macOS 字体资源再分发。该确认继续有效，无需因字体名称表没有许可字段而再次申请同一授权；私有授权文件和商业条款不公开。本文件后面的字体盘点记录元数据与声明交付缺口，不能据此撤回已有授权或推断没有分发权。

已有授权不等于所有原始版权声明、对应源码及实际安装包均已交付核验；后续仍保留这些检查，也不把授权扩大到范围外的资源。官方 Wayfern155 试验遇到的 Donut Browser 套餐接口限制是独立的运行时配置问题，不能据此认定已有书面运行/分发授权失效。

## npm 原文与原生成品

移动端「平台能力」保留网络组件原始声明、GPL 全文及固定源码链接，并新增可离线搜索的 JavaScript 依赖许可页。该页列出本次构建实际安装的 npm 包，包含构建工具；不是对最终 JS bundle 的逐模块占用分析。

`apps/universal/scripts/collect-npm-notices.mjs` 在 Actions 的 `npm ci` 之后运行，读取版本 3 锁文件与安装树，核对版本，保留包根目录及 LICENSES 目录中的原始版权文本和 SHA-256。若根目录没有声明，继续寻找包内深层版权文件，或保留含完整 MIT 授权原文的 README。输出 `src/npm-notices.json` 参与 Expo 打包，并与锁文件保存为同次 Actions 工件。程序不会访问网络、执行依赖脚本或读取应用账号数据；离开依赖目录的路径、元数据/版权文件软链接、版本漂移及缺失的必需包都会阻止生成。

缺少包内原文的部分组件使用 `third-party/npm-notice-supplements.json` 中的原件：通过 npm 发布元数据的 `gitHead` 找到该包对应的不可变上游提交，并保留该提交的版权文件全文、来源 URL 及 SHA-256。生成时要求包名、版本、锁定 tarball 完整性和声明许可证全部一致，再校验文本摘要；更新版本后不能静默复用旧原文。没有原文证据的项目继续留在 `review`。

源码中的空清单明确标为开发占位。正式候选工作流四个应用构建任务均在类型检查、Expo prebuild/export 和原生编译前重新生成清单。平台不适用的可选包记录在 `notInstalled`；缺少版权文本或许可证声明的已安装包记录在 `review`，界面明确显示文本尚需核实，不用通用许可证代替原件。

独立 `mobile-notices.yml` 验证原文保存、版本漂移、目录穿越、软链接边界，并导出共享 Web 界面，以真实浏览器离线打开、搜索、展开 React 原始版权文本和关闭页面，保留截图。此界面验证不能替代 Android/iOS 原生成品验收。

`5a55b17` 的 [Actions40553867714](https://github.com/lilyco-42/lyco-browser/actions/runs/40553867714) 已通过六项生成器测试、TypeScript、Expo 导出和离线浏览。501 个已安装 npm 包中，35 项使用精确版本的上游原件；缺少文本的条目从 41 项降到 3 项：`jimp-compact`、`structured-headers`、`tr46`。这三项仍需处理。新增原生 Maestro 流程在保留原有存储/导航/断代理用例的同时，实际打开、搜索、展开版权文本及关闭许可页；Android 签名候选 `75b0d55` 的 [40554474153](https://github.com/lilyco-42/lyco-browser/actions/runs/40554474153) 已通过此流程并保留原始截图。iOS 的该新增流程尚无成功证明，原有路由失败仍阻止其发行。

桌面新增的 Noto Sans SC 工作台字体保留完整、未修改的上游 TTF、原始 OFL 全文和固定来源清单，随包位于 `lyco/ui-font/`。字体和许可证均按固定长度及 SHA-256 核验。`fa40538` 的 Linux、macOS 成品已通过原件摘要、中文加载与字形观察；Linux 完整功能和原始截图复核通过。详见 [字体来源与运行证据](WORKBENCH-FONT.md)。这只覆盖此次新增工作台字体，不能替代浏览器内核所带其他字体和组件的清单。

逐文件摘要和格式范围保存为 [e5ed180 字体资产盘点](audits/font-inventory-e5ed180.json)，记录的是该内部候选，不是许可通过清单。

2026-10-28 只读盘点 `e5ed180` Linux 归档：`assets/font-subsets/` 下有 340 份文件（149 TTF、21 OTF、170 WOFF2），已逐文件记录路径、大小与 SHA-256，没有执行产品或字体渲染。170 份 SFNT 名称表未观察到版权/许可字段，压缩 WOFF2 的名称表本轮未解析；字段缺失不等于没有授权。170 份随包 WOFF2 路径和大小与[固定上游索引](https://github.com/sheying2013/OpenBrowser/blob/5fa3b9d0bd218a948da15820b35fe598c362eba0/Browserapp/assets/font-subsets/index.json) 全部匹配；[上游构建脚本](https://github.com/sheying2013/OpenBrowser/blob/5fa3b9d0bd218a948da15820b35fe598c362eba0/Browserapp/scripts/build-font-subsets.py) 指向内核或平台字体目录作为原件。平台字体名称和上游附带资产不能代替原始许可及分发条件的核对。该盘点只补充清单，完整字体商业分发审查仍未完成，不扩大 Noto UI 字体已有证明的范围。

此 npm 清单只覆盖安装树。Go 核心另有固定源码和模块 ZIP 审阅包；Pods、Gradle、浏览器内核、其他字体、SDK 及其完整对应源码交付仍需各自检查。`review` 中的项目须在商业发行前逐项处理；清单生成成功不能证明所有第三方分发义务已完成。

2026-11-03 对三项缺失原文继续只读核查：[固定版本来源审计](audits/npm-notice-gaps-20261103.json) 将 npm 发布元数据的 `gitHead`、完整未截断源码树与当前锁文件完整性绑定。三个对应提交都没有独立许可声明文件；两份已有 README 也没有完整 MIT 授权原文。Jimp README 只链接可变的上游许可页面，不能将当前页面文本冒充发布时原件。因此未补写通用许可证，三项 `review` 保留。这不改变之前单独 JS 导出中未观察到它们的有限结果，也不能推断其全部分发义务已经完成。

新增的 [原生平台 JS 来源观察](NATIVE-JS-INVENTORY.md) 在 `a7e7a6c` 的 [40635942712](https://github.com/lilyco-42/lyco-browser/actions/runs/40635942712) 两平台成功：Android 598、iOS 601 个来源记录，各观察到 28 个 npm 包，三项缺原文包均未出现在该次单独导出的来源映射中。该结果尚未关联保留的实际签名成品，不删除安装树缺失记录，不扩大为原生依赖或许可交付完整证明。

字体名称表和上游索引只提供资源与字段证据。对于 README 已记录所有者确认的授权范围，后续工作是对应资源、保留原始声明和核对实际交付；不能继续将这部分一概标为“分发权利未确认”。其他范围的字体及组件仍依据各自原始记录处理。

后续真实 [Actions40712032938](https://github.com/lilyco-42/lyco-browser/actions/runs/40712032938) 已从同一摘要的保留归档解析全部 357 份字体（155 TTF、21 OTF、181 WOFF2），零个未解析字体面。340 份平台子集的版权、许可描述及许可 URL 字段均未观察到内容；另外 17 份字体有版权字段，其中 11 份有许可描述、15 份有许可 URL。新增[完整格式元数据索引](audits/font-metadata-e5ed180.json)保留逐文件摘要与字段存在情况，原始文本留在 Actions 工件。这弥补了前一轮压缩元数据未解析的证据缺口；字体内部字段存在或缺失仍不能替代实际分发授权和原始声明的核对。解码工具仅用于 CI 读取，不进入产品依赖或安装系统字体。


2026-11-03 对实际签名候选 [41594819546](https://github.com/lilyco-42/lyco-browser/actions/runs/41594819546) 的完整原件做只读 ZIP/ELF 盘点，新增[成品原生库索引](audits/android-native-inventory-77d304f.json)。索引绑定源码 `77d304f`、原始候选档案和实际 APK 摘要，逐项保留 32 份共享库的大小、SHA-256 与 ELF 架构：ARM64、x86_64 各 16 份；另有 45 份版本描述及 2 份名称含版权关键词的文件。没有执行应用或共享库。文件名不能证明组件来源和许可，关键词匹配也没有检查 JS 内的文本，不能据此说包内只有这两份声明；已有离线 npm/核心声明仍分别保留。下一步需将这些实际库逐一对应到构建依赖、原始声明及源码，尚未完成商业交付审查，也未新增运行通过证明。

### 当前 Android 成品的原生元数据

2026-11-04 的真实 [Actions 41772456928](https://github.com/lilyco-42/lyco-browser/actions/runs/41772456928) 重新取得 `82ce7bc` 签名候选 [41754332654](https://github.com/lilyco-42/lyco-browser/actions/runs/41754332654) 的三份完整原始档案，核验大小/SHA/CRC、实际 APK 与原生打包 JS 的字节对应，并独立复核保留签名身份。随后使用固定 Go 1.25.5 标准库读取 ELF 和嵌入构建信息，未加载或执行目标共享库。完整原始结果 ZIP 为 2283252 字节，SHA-256 `0643d5fd10a0ef7cfa66c2331ef5f2cb00ca36050ed0422a169cfdbf6420ee61`，已再次核验大小/SHA/CRC。

未修改的[原始报告](audits/native-android-libraries-41754332654.json)及[来源记录](audits/native-android-libraries-41754332654.source.json)绑定实际 APK `8bed4c44c56c38f610bd5852910568a22a1d6a52678bbf8681b20a427cd11e99`。32 份 ELF 库包含架构、逐文件摘要、动态依赖和可用编译器注释；其中 30 份与旧 `77d304f` 包逐字节相同，两份变化均为 `libgojni.so`。两种架构各读出相同的 72 项 Go 模块及其版本/校验和，全部匹配当前 `mobile/core/go.sum`，无模块替换；Go 版本 1.25.5、Android 目标、QUIC/uTLS 标签及嵌入 Git 版本 `82ce7bc` 均有原始记录。

嵌入信息同时明确标记 `vcs.modified=true`，此事实保留：本轮没有独立保存该次生成的绑定源码，不能称为可重现的源码到二进制证明。编译器注释包含多种 Clang 版本，也不能由此推断完整 NDK 版本。动态依赖不覆盖静态合入组件；上述 72 项并非全部原生组件，仍需逐项关联原始版权文本、构建输入、生成源码及对应源码交付。原有三项 npm 缺原文记录、Pods/Gradle/内核/字体和平台 SDK 审查均保留。

### 实际 Go 依赖的源码与声明原件

[Actions 41773750136](https://github.com/lilyco-42/lyco-browser/actions/runs/41773750136) 已在固定 Go 1.25.5 下完成这些实际依赖的原件收集。新任务消费成功的原生元数据审阅档案，核验其完整大小/SHA/CRC、生产提交和实际 APK 关联，要求两种架构的模块集合一致，逐项使用 `go mod download` 获取精确版本，并要求模块及 go.mod 的 Go 校验和同时匹配原锁文件。它不编译或执行目标代码，也不修改产品锁文件；没有重跑已通过的编辑验收。

完整原始结果 ZIP 为 78738800 字节，SHA-256 `d603cd940cd6b254e2e0310593dcd03c3f593e40ade7c20cd032571e65ef67b0`。下载后已独立核验完整 ZIP 大小/SHA/CRC、全部 72 个模块的原始 ZIP/go.mod/version.info 摘要、每个模块 ZIP 的 CRC，以及 104 份声明候选与原 ZIP 对应文件的逐字节一致性。[未修改的原始清单](audits/native-android-go-sources-41754332654.json)及[核验来源](audits/native-android-go-sources-41754332654.source.json)保留每个版本、Go 校验和、原件 SHA、相对目录和声明来源路径。72 个模块均有文件名匹配的候选，其中包含 LICENSE、NOTICE、COPYRIGHT、PATENTS 和 AUTHORS；候选存在不等于许可义务审查已经完成。

档案还包含实际生产提交 `82ce7bc` 的完整受跟踪应用源码，压缩包 2579830 字节、SHA-256 `1f0c2aa8cbe3ac343143f94d864f2ba0bb66b9ba5e82c7316c6dadfc7928a9da`，其 Git 归档提交标记和内部核心锁文件均已核验。这补齐了当前 APK 已观察到的 Go 模块原件关联，不能覆盖 Go 标准库、cgo/NDK、未跟踪生成的绑定、其他原生库或全部对应源码。Actions 审阅档案不是长期客户源码下载渠道；客户端原文接入的后续状态见下节。

### Android 客户端离线声明接入

[41774795974](https://github.com/lilyco-42/lyco-browser/actions/runs/41774795974) 在相同原件检查后新增实际生成的离线声明数据。完整原始 79106033 字节 ZIP，SHA-256 `89c8b0c333c14b522c20c5c667f519768d7d9aee31f65847369fb30d6f508f84`，已完整大小/SHA/CRC 核验；72 项模块原件全部与上一轮一致。数据 366995 字节，SHA-256 `8dd661c87580366993b73a5304c97576c16d52abea90254e9a4f974744976b75`，104 份 UTF-8 文本均与原始模块 ZIP 逐字节对应，没有换用通用许可、推断 SPDX 或改写空白。

`4dc38db` 将该原始数据不修改地保存到 Android 客户端，并新增「网络依赖原始声明」入口：可搜索名称或版本，查看完整原文，清除搜索，并在关闭或返回后重置查询。原 JavaScript 页面和网络核心 GPL 全文保留。此列表按已经核验的 Android 模块集合提供，不扩大成 iOS 原生依赖清单。

新构建门槛核对整份数据摘要、逐份文本摘要、模块/go.mod 校验和，以及与生产提交相同的完整核心源码树。签名候选 [41775491059](https://github.com/lilyco-42/lyco-browser/actions/runs/41775491059) 已成功：实际 APK 130039995 字节、SHA-256 `b8a7d5f627fe3cf483dd0d0c60b131cf5272578748e358eadc76951386cf2ce1`，保留证书、1.0.25/build 2、24 项策略与七个原生流程均通过。五份完整原始档案的大小/SHA/CRC、APK 内部 CRC、实际打包 JS 与 map 的字节关联均另行核验；603 条来源中的 `GoNotices.tsx` 和整份原始 JSON 与源码逐字节相同。

新增原生流程的 30 条必需命令均已完成，覆盖 72/104 计数、零结果/清除、精确版本、原始版权文本、关闭及系统返回；六个原有流程、六份存储报告和五次导航及停代理负向条件保留。[原始页面截图](images/android-go-notices-4dc38db.png)及[来源记录](images/android-go-notices-4dc38db.source.json)由完整原生档案不修改复制，已人工查看。该证明限于受控 API35 原生设备，不覆盖真实客户线路、支付、RTC 或 iOS 页面。

同包 [41807552298](https://github.com/lilyco-42/lyco-browser/actions/runs/41807552298) 已真实编译并执行原生元数据读取器，两种架构各 72 项 Go 模块的版本/校验和均与客户端原始列表完全一致。完整原始结果 2401298 字节、SHA-256 `7d48c6bedcf09972b69373a5298645efd423db4d5d18526bd9dc4c15254bce7e`，已核验大小/SHA/CRC；其嵌套 map/notices 与生产档案逐字节相同。未修改的[32 库原始报告](audits/native-android-libraries-41775491059.json)和[来源核验](audits/native-android-libraries-41775491059.source.json)保留实际 APK/源码绑定；每库大小、摘要和 ELF 架构已再次独立对应实际 APK。603 条 JS 来源映射 28 个 npm 包，原有三项安装树缺原文记录仍保留。嵌入 `vcs.modified=true`、生成绑定与完整对应源码缺口未消失，不能把图谱匹配写成全部原生许可或源码交付完成。

同包完整编辑验收 [41777833241](https://github.com/lilyco-42/lyco-browser/actions/runs/41777833241) 因历史兼容包过期，在设备运行前失败；恢复精确旧包的 [41810250795](https://github.com/lilyco-42/lyco-browser/actions/runs/41810250795) 又因 GitHub 草稿读取权限在设备运行前失败。均未构成新包编辑、升级降级或恢复成功证明。历史旧包按固定 SHA 保留为未发布草稿，准备任务与只读设备验收分开。后续同包 [41810777700](https://github.com/lilyco-42/lyco-browser/actions/runs/41810777700) 已完整成功：14 项综合检查、15 个原生流程、四次名称/首页全文核对以及原 7 次和新增 1 次真实网页/存储观察通过。完整原始验收 ZIP 1895964 字节、SHA-256 `44f0abb68024b71b4c6c5cf91afb4355ddcf96f2b61bc6f05ab06994803fcdf0` 和原件夹具 ZIP 47772208 字节、SHA-256 `a73e4de37b2773c9667908d72a5671dac69018fbcd4df56bf39b3a8cb50c55cf` 均另行完整大小/SHA/CRC 核验；恢复的六份历史原文件逐字节等于原件，未重编译或重签名。原始取消/非法输入、重开新首页、三类存储与原身份/线路保持、旧版拒绝覆盖、恢复和原生撤权门槛保留并通过；升级/降级/恢复绑定摘要一致。已查看本包真实保存及非法网址截图。[未修改的原始结果](audits/android-paid-41810777700.json)和[来源核验](audits/android-paid-41810777700.source.json)绑定当前 APK；此范围仍是受控 API35/CI Billing，不证明真实付款、客户出口、产品 RTC 或 iOS 路由。共享源码 iPhone [41807704860](https://github.com/lilyco-42/lyco-browser/actions/runs/41807704860) 已完成 ARM64/iPhoneOS 未签名编译，完整原件和版本已核验；IPA 23232154 字节、SHA-256 `96502e34ad16a723502c72e91e3d9e3740f2e2168784dc4afb478300d7ee4859`。不能直接安装，没有真机、iOS 页面或代理通过证明。

### 固定 Go 编译器、运行时和标准库源码

[41776442283](https://github.com/lilyco-42/lyco-browser/actions/runs/41776442283) 已成功保存官方 Go 1.25.5 完整源码，不编译或执行其中代码。版本与实际 Android 原生记录及离线模块数据中的 Go 版本一致；固定摘要来自 [Go 官方发布页](https://go.dev/dl/#go1.25.5)，任务还重新核对官方完整发布元数据，拒绝版本、大小或摘要不符的源包。

完整原始 Actions ZIP 37040133 字节，SHA-256 `0c9c26a9f08ec839844952cf91ab423ba9cfb81eaec350080893df9d090a5905`；其中官方原始 `go1.25.5.src.tar.gz` 为 31983405 字节，SHA-256 `22a5fd0a91efcd28a1b0537106b9959b2804b61f59c3758b51e8e5429c1a954f`。下载后再次核验完整 ZIP 大小/SHA/CRC、源包 SHA/完整 gzip CRC、VERSION，以及 16067 个目录条目中全部 14480 份普通源文件的逐项摘要；37 份声明候选均与源 tar 原文件逐字节一致。

[来源核验记录](audits/go-toolchain-source-1.25.5.source.json)保留来源、原件和完整索引的摘要及候选声明位置；根目录 [LICENSE](audits/go1.25.5/LICENSE) 和 [PATENTS](audits/go1.25.5/PATENTS) 已不修改复制供审阅，完整源包及全部索引保留在 Actions 原始档案中。这补齐精确版本官方源码及声明原件的保留，不代表逐文件链接范围或源码到原生二进制的可重现证明；NDK/cgo 的外部 C 依赖、生成绑定、其他原生库、客户端声明打包及完整对应源码交付仍需分别验证。正在构建的 Android 应用、其 72/104 离线列表及原生门槛未因本次源码留存改变。
