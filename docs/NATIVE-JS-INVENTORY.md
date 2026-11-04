# 移动端 JavaScript 导出来源观察

原有 npm 许可页覆盖实际安装树，其中包含构建工具。为了界定三项缺少版权原文的包是否进入运行时代码，新增单独的 Android/iOS JavaScript 导出审计；没有删除安装树中的缺失记录，也没有修改原生应用。

使用 Expo 官方提供的 `expo export --source-maps --no-bytecode --platform android/ios`，分别生成生产模式 JavaScript 与外部来源映射。方法参考 [Expo bundle 分析文档](https://docs.expo.dev/guides/analyzing-bundles/)。这是单独导出，不是已经保留的签名 APK 或设备 IPA，也不包含 Pods、Gradle、Go 核心、WebView 或平台 SDK 的完整依赖。

`inventory-exported-js.mjs` 在 Actions 读取原始来源映射，支持有界嵌套的 indexed maps，拒绝外部映射引用、损坏结构、超限输入、目录软链接及缺失关联 bundle。包名按真实来源路径中的最近 `node_modules` 边界识别；不通过 bundle 内的包名字符串判断，因此许可清单中的文字不会被误当成运行时代码。原生核心包 react/react-native/expo 必须出现，依赖清单的锁文件摘要必须一致。Metro 的 NUL 前缀虚拟 polyfill 标签仅作为合成来源保留，不用作文件路径。当前原件没有 `sourceRoot`；非空或非字符串的 root 形态会被明确拒绝，避免未来格式变化时静默漏算包名。

第一次 [40635766788](https://github.com/lilyco-42/lyco-browser/actions/runs/40635766788) 完成两平台导出，但解析器拒绝了三条真实的 Metro 虚拟来源，因此该轮失败，没有给出包缺失结论。`a7e7a6c` 增加格式处理和回归用例后，[40635942712](https://github.com/lilyco-42/lyco-browser/actions/runs/40635942712) 两平台全部成功，七项来源解析用例通过。

| 该轮观察 | Android | iOS |
| --- | ---: | ---: |
| 原始来源记录（去重） | 598 | 601 |
| 观察到的 npm 包名 | 28 | 28 |
| 未映射到安装清单的包名 | 0 | 0 |
| 观察到的包中原文缺失记录 | 0 | 0 |
| jimp-compact / structured-headers / tr46 来源 | 均未观察到 | 均未观察到 |

JavaScript SHA-256：Android `405cfe09f4e0a4e520d5098083daa629e2de7d7f6efc23714b436c2bc701c847`；iOS `c20a8502c8043ab3a5ff7e876755813ab56fdc0b6fc5e86aa8fc21df79d00400`。报告同时保存原始 map 摘要、长度、来源计数、实际安装版本集合及缺失文本记录。

这些结果仅支持这次单独 JS 导出的来源观察。仍需关联实际分发成品及其全部原生组件；不能据此宣称三项缺失版权原文已补齐、全部分发义务完成，或 iOS 真机/路由已经通过。原本离线许可页验收默认流程保持；现有 `mobile-notices.yml` 的 `native_js_inventory=true` 手动输入才执行此研究分支。

`60766b2` 增加 sourceRoot 形态拒绝后的 [40636765364](https://github.com/lilyco-42/lyco-browser/actions/runs/40636765364) 两平台复验成功，七项解析用例和上述来源、包名及目标观察均保持；下载的原始 bundle/map 摘要与 Actions 报告一致。


2026-11-04 对实际签名包 [41748283716](https://github.com/lilyco-42/lyco-browser/actions/runs/41748283716) 及其完整原始日志的只读检查，确认原生构建已经生成 `index.android.bundle.packager.map`，但原先三个归档仅保留 APK、原生验收和依赖声明；APK 中有编译后的 bundle，没有 map。因此新增下一次 Android 构建的独立原件归档：保留这次实际 packager map、构建 bundle、版本与来源回执及摘要，先核对 bundle 和 APK 内字节一致，再绑定 APK/map/bundle 的 SHA-256。原件步骤已在 [41754332654](https://github.com/lilyco-42/lyco-browser/actions/runs/41754332654) 成功，完整原始 ZIP（2101071 字节、SHA-256 `4b9b2bbf6f5a75b61cab2271d4967644f36be0eaece70867887afcf7e795de42`）、APK 与回执都已核验大小、摘要和 CRC。实际 APK SHA-256 为 `8bed4c44c56c38f610bd5852910568a22a1d6a52678bbf8681b20a427cd11e99`；1823940 字节构建 bundle 与 APK 内字节一致，SHA-256 `60cf14d4abd3f051a69e66138d2af0f40a22aea3445408d949c2d3366fa4b6a0`。6741611 字节原生 packager map 有601条来源记录，SHA-256 `093af05d7bab93ee13b297b1af1609b04268e7011177198881c945db9dbe6eb9`；尚未据它完成新的包名分类，不能把601条来源写作601个npm包。这里的 packager map 不冒充最终字节码行号映射，也不替代全部原生组件、许可清理或对应源码交付审查；之前独立 Expo 导出结果的范围不变。
