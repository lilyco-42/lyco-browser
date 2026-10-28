# 第三方版权与源码交付

移动端「平台能力」保留网络组件原始声明、GPL 全文及固定源码链接，并新增可离线搜索的 JavaScript 依赖许可页。该页列出本次构建实际安装的 npm 包，包含构建工具；不是对最终 JS bundle 的逐模块占用分析。

`apps/universal/scripts/collect-npm-notices.mjs` 在 Actions 的 `npm ci` 之后运行，读取版本 3 锁文件与安装树，核对版本，保留包根目录及 LICENSES 目录中的原始版权文本和 SHA-256。若根目录没有声明，继续寻找包内深层版权文件，或保留含完整 MIT 授权原文的 README。输出 `src/npm-notices.json` 参与 Expo 打包，并与锁文件保存为同次 Actions 工件。程序不会访问网络、执行依赖脚本或读取应用账号数据；离开依赖目录的路径、元数据/版权文件软链接、版本漂移及缺失的必需包都会阻止生成。

缺少包内原文的部分组件使用 `third-party/npm-notice-supplements.json` 中的原件：通过 npm 发布元数据的 `gitHead` 找到该包对应的不可变上游提交，并保留该提交的版权文件全文、来源 URL 及 SHA-256。生成时要求包名、版本、锁定 tarball 完整性和声明许可证全部一致，再校验文本摘要；更新版本后不能静默复用旧原文。没有原文证据的项目继续留在 `review`。

源码中的空清单明确标为开发占位。正式候选工作流四个应用构建任务均在类型检查、Expo prebuild/export 和原生编译前重新生成清单。平台不适用的可选包记录在 `notInstalled`；缺少版权文本或许可证声明的已安装包记录在 `review`，界面明确显示文本尚需核实，不用通用许可证代替原件。

独立 `mobile-notices.yml` 验证原文保存、版本漂移、目录穿越、软链接边界，并导出共享 Web 界面，以真实浏览器离线打开、搜索、展开 React 原始版权文本和关闭页面，保留截图。此界面验证不能替代 Android/iOS 原生成品验收。

`5a55b17` 的 [Actions40553867714](https://github.com/lilyco-42/lyco-browser/actions/runs/40553867714) 已通过六项生成器测试、TypeScript、Expo 导出和离线浏览。501 个已安装 npm 包中，35 项使用精确版本的上游原件；缺少文本的条目从 41 项降到 3 项：`jimp-compact`、`structured-headers`、`tr46`。这三项仍需处理。新增原生 Maestro 流程在保留原有存储/导航/断代理用例的同时，实际打开、搜索、展开版权文本及关闭许可页；Android 签名候选 `75b0d55` 的 [40554474153](https://github.com/lilyco-42/lyco-browser/actions/runs/40554474153) 已通过此流程并保留原始截图。iOS 的该新增流程尚无成功证明，原有路由失败仍阻止其发行。

桌面新增的 Noto Sans SC 工作台字体保留完整、未修改的上游 TTF、原始 OFL 全文和固定来源清单，随包位于 `lyco/ui-font/`。字体和许可证均按固定长度及 SHA-256 核验。`fa40538` 的 Linux、macOS 成品已通过原件摘要、中文加载与字形观察；Linux 完整功能和原始截图复核通过。详见 [字体来源与运行证据](WORKBENCH-FONT.md)。这只覆盖此次新增工作台字体，不能替代浏览器内核所带其他字体和组件的清单。

此 npm 清单只覆盖安装树。Go 核心另有固定源码和模块 ZIP 审阅包；Pods、Gradle、浏览器内核、其他字体、SDK 及其完整对应源码交付仍需各自检查。`review` 中的项目须在商业发行前逐项处理；清单生成成功不能证明所有第三方分发义务已完成。

新增的 [原生平台 JS 来源观察](NATIVE-JS-INVENTORY.md) 在 `a7e7a6c` 的 [40635942712](https://github.com/lilyco-42/lyco-browser/actions/runs/40635942712) 两平台成功：Android 598、iOS 601 个来源记录，各观察到 28 个 npm 包，三项缺原文包均未出现在该次单独导出的来源映射中。该结果尚未关联保留的实际签名成品，不删除安装树缺失记录，不扩大为原生依赖或许可交付完整证明。
