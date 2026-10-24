# 原生字段契约观察（未修复、非产品验收）

这些实验定位普通新标签首次请求/脚本与后续浏览器信息不一致的问题。只运行于 GitHub Actions 的临时身份，不访问外部账号，不修改检测器、评分、客户缓存或产品行为。

## 固定环境

- 上游 `sheying2013/OpenBrowser`：`5fa3b9d0bd218a948da15820b35fe598c362eba0`。
- 内核版本：149.0.7827.114。
- chrome.exe SHA-256：`c24aab659c0712f3fd2a5bb8e148f403b6838c452abb0cd055affcfbe0497506`。
- chrome.dll SHA-256：`eedffa7895cbfdd8e15acddc4aee3e5743d9e6bed63446e6483770b5988fb8c9`。
- 使用正常首次运行条款参数；不更改许可、权限或二进制。
- 自有 loopback 页面同步采集首段脚本值；服务端保留首次请求头、首次报告和次数，后续报告不能覆盖首次结果。

## 已完成实验

| 运行 | 实验提交 | 范围 |
| --- | --- | --- |
| [39974132337](https://github.com/lilyco-42/lyco-browser/actions/runs/39974132337) | bd69c176ef32dd281361c535e96409d563af7d7f | 原生 CPU 对照、同页面回读、普通新标签与独立 CDP CPU 对照 |
| [39974864468](https://github.com/lilyco-42/lyco-browser/actions/runs/39974864468) | 8558a045e88e73f00c3bffc294f3477ed9f39124 | 追加固定内核自身的公开本地协议结构 |
| [39975385989](https://github.com/lilyco-42/lyco-browser/actions/runs/39975385989) | 1b0230fa776f572476eff91713410d48c06e8e40 | 对比完整设备与只提交可选标量字段 |
| [39976771248](https://github.com/lilyco-42/lyco-browser/actions/runs/39976771248) | 67173efb81bf66376810b87adaebaa05d3a1bc57 | 原生 UA/平台的明显测试标记与六个参数的公开说明 |

四次退出成功都表示观察完成。JSON 明确为 `diagnosticOnly:true`、`productAcceptance:false`；不构成产品通过。

最后一次实际观测：

| 设置 | 同页面回读 | 普通新标签回读/首脚本 | 种子摘要 |
| --- | --- | --- | --- |
| 完整设备，仅 CPU 4 → 2 | CPU 为 2 | CPU 为 2 | 未变化 |
| 完整设备，平台版本 → 15.0.0 | 仍为 12.0.0 | 仍为 12.0.0 | 未变化 |
| 完整设备，品牌/品牌版本/平台版本 | 三项均未匹配 | 三项均未匹配 | 未变化 |
| 仅平台版本可选字段 | 仍为 12.0.0 | 仍为 12.0.0 | 未变化 |
| 仅品牌/品牌版本/平台版本可选字段 | 三项均未匹配 | 三项均未匹配 | 未变化 |

独立标准 CDP CPU 设置也在原临时页面的首段脚本观察到 2。这个对照只验证连接/采集链路，不代表原生 UA 设置已生效。UA 实验没有使用 Emulation/Network UA 覆盖或页面 JS 属性改写。

## 接口声明与实际结果

固定内核的本地 `/json/protocol` 包含 Wayfern domain。`setFingerprint` 直接声明可选的 `userAgent`、`platform`、`platformVersion`、`brand`、`brandVersion` 字符串及 `hardwareConcurrency` 整数；返回 `fingerprint` 对象。当前参数不是未声明的字段，也没有证据表明需要嵌套包装。

CPU 对照证实同一原生设置接口至少有一项能够生效。三个 UA 字段在同页面就未匹配，不能将全部差异只归因于新标签传播。最小标量调用也没有改变结果，这次实验不支持“完整设备中其他字段覆盖了设置”是唯一解释。

仍不能由这些结果确定内核实现、版本契约、正常授权模式或其他条件中哪项是原因。不要猜测隐藏参数，不改许可或绕过授权，也不要将未生效配置显示成已保护。后续产品修复仍需实际契约依据及完整原生门禁，当前不提供修复通过结论。

## UA 字符串与平台字符串对照

第四轮通过同一原生接口为 User-Agent 追加明显的 `LYCO-Contract-Control/1.0` 标记，并单独设置平台字符串测试标记。两项在同页面、新标签原生回读与首段脚本均生效；User-Agent 还与服务端首请求值一致。三个品牌/版本元数据字段仍没有生效，七个场景观察到的 Canvas 种子摘要均未改变。

因此问题范围可以缩小到被测试的元数据字段，不能说整个 UA/平台配置渠道无效。公开参数说明仅标注可选及字段用途，没有解释这三项不生效的条件。此结果仍不证明元数据问题的实现原因，也不解决首次导航的一致性问题。标记只用于自有 CI 页面，不能用于真实用户身份或当成检测通过证据。

## 工件完整性

| 工件 | ZIP SHA-256 |
| --- | --- |
| 12511150286 | `4b69d52bb145f6b66ddb75577ebdad34c7614f0152113eb2443a83ad9e8ea70a` |
| 12510199701 | `b174c7b80a69730c573d210f49d7e6968f4b3ffdd36a60167d0be02be4c44dd0` |
| 12510802909 | `1683fe7f2a8202f7d03ec11417024d8ec6fd82b842687ef37ebe27a6e4dc9c54` |
| 12512360329 | `438e3c59c78f408a96b4743d547f1f7122849da47b49dd06da71f3e1d7d59988` |

本机找到的另一个 `lyco-fingerprint-browser` 包与这里运行的 `lyco-browser` 原生集成不能混用验收证据。以上也不能证明用户本机路线，或保证第三方服务不会检测、限制或关联账号。

## 首次导航前的标准 CDP 对照

[40092291440](https://github.com/lilyco-42/lyco-browser/actions/runs/40092291440)，源提交 `2f4891782438e98a11bb506b3de5bb3a458eafa8`，对同一固定 149 内核独立比较 Emulation、Network 及两者共同设置。每组新建空白目标、持有本目标连接，先完成设置并收到确认，再导航自有 loopback 页面；首次请求和首次脚本各采集一次。此前原生实验的结论不由这些标准 CDP 对照替代。

| 观察 | Emulation | Network | 两者共同 |
| --- | --- | --- | --- |
| 设置先于首次导航 | 是 | 是 | 是 |
| 请求 UA 匹配合成标记 | 是 | 是 | 是 |
| 首段脚本 UA 匹配合成标记 | 否 | 否 | 否 |
| 请求品牌匹配设置 | 否 | 否 | 否 |
| 脚本品牌、完整版本、平台版本匹配设置 | 均否 | 均否 | 均否 |
| 观察到的种子摘要改变 | 否 | 否 | 否 |

实际品牌仍为 Chromium 149 与 Not)A;Brand 24，平台版本仍为 12.0.0。请求与脚本的 UA 字符串不同。原始 JSON 中 `requestAndFirstScriptConsistent:true` 只对应现有 Client Hints 验证器的检查范围，**不表示 UA 字符串一致，也不表示符合期望设置**；不能据此报告整体一致。原始证据保留原样。

工件 `12559102964` 的 ZIP SHA-256 为 `06ef3cd08d8595d66d957016eeca0fd205fafa9edf7d4096d5fb63e641698a90`，与 Actions 元数据摘要核对一致。该任务成功仅表示观察完成；报告仍明确 `productAcceptance:false`。结果不支持把应用晚注入作为唯一原因，没有证明具体内核故障或授权条件。

## 当前官方契约与 149 的版本边界

2026-10-24 读取[官方分发元数据](https://donutbrowser.com/wayfern.json)，当前为 155.0.8059.79。该信息是分发状态，不是本产品已升级或通过验收的证据。

官方应用源码固定到 [`16ba69ff5d18920af2662ffd0cd0f7a0cc7d6a51`](https://github.com/donutbrowser/donutbrowser/tree/16ba69ff5d18920af2662ffd0cd0f7a0cc7d6a51)，其 [wayfern_manager.rs](https://github.com/donutbrowser/donutbrowser/blob/16ba69ff5d18920af2662ffd0cd0f7a0cc7d6a51/src-tauri/src/wayfern_manager.rs#L372) 明确区分：151 新增 identity API，152 新增启动身份文件等契约，155 新增启动结果配置。源码仍保留旧完整设备的 setFingerprint 路径。因此不能把新版启动文件参数移植到 149，当作现有内核已支持的修复。

[当前官方应用文档](https://donutbrowser.com/docs/profiles/)也提醒自定义值与其余设备信息不符可能导致问题；[官方远程浏览器说明](https://donutbrowser.com/docs/remote-browsers/)说明升级至 155 后存在旧版本无法重开配置的边界。这里没有升级用户配置、登录其账户、使用云端会话或获取新的授权凭据。网站的托管服务权限说明亦不等同于用户已确认的独立产品书面分发授权。

下一步所需的具体契约证据：149 版本是否允许修改 brand、brandVersion、platformVersion，生效范围及正常授权条件；以及该版本是否承诺标准 CDP UA 字符串与 JS/Client Hints 同步。在此之前，不继续猜测参数或重复已否定的晚注入修复，不删掉失败断言，也不把默认值改成期望值来获得通过。如评估新内核，应使用独立的临时配置与单独门禁，不能覆盖现有用户配置。
