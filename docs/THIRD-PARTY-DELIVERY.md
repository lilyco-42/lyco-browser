# 第三方版权与源码交付

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
