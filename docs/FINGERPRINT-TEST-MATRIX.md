# 独立指纹检测验收矩阵

本矩阵对应 Windows Wayfern149 原生浏览器。所有构建和浏览器运行只在
GitHub Actions 执行，不使用普通 Chrome 的结果冒充产品结果，不修改检测分数。

## 当前证据

`e9fc0ab` / [Actions39536470665](https://github.com/lilyco-42/lyco-browser/actions/runs/39536470665)
已完整写出报告，仍失败（5个独立场景/检测失败）。B确已启动、A/B同时在线，
两份原身份缓存字节不变，原生34项检查通过。A初次和重开均在DPR1保留旋转
矩形异常，地区23/low及SDK通过。B的DPR1.25与CSS匹配，但Creep未完成，
地区扫描读取超时，SDK已采集原始结果后截图超时；不能将B算作通过。
官方与本地工件SHA-256均为
`81f9650ecc85a28464f7151346faf6278696064947c05a5c90faaf7836fee872`。

当前只在原场景已失败后采集一秒CPU诊断：裸CDP页面连接执行Profiler命令，
不注入脚本、不加断点、不解除暂停、不重载或重试检测。原失败状态保留，
全绿场景不启用Profiler。保存调用树/采样/固定来源类别，删除URL与额外字段，
不捕获局部变量；不可用/超时明确记录。用来定位无响应页面，不冒称产品修复。

`7d6ae33` / [Actions39534105163](https://github.com/lilyco-42/lyco-browser/actions/runs/39534105163)
被测试进程未处理的Socket `ECONNRESET` 中断，最后快照停在B启动，不能判定
逐页启动修复是否生效。A三组通过，但只读DPR=1.5：固定旋转的DPR=1分支
没有覆盖。原始工件SHA-256为
`3430c82e8e79ffd5340602476c92eb525f2e06f2453f75b4070019311ce27b65`。
当前修复保证CI代理拒绝CONNECT的早退分支也有Socket错误处理，并记录有界的
错误代码；不改变网络白名单、响应、检测结果或通过条件，普通编程异常仍抛出。

`d27233f` / [Actions39532311213](https://github.com/lilyco-42/lyco-browser/actions/runs/39532311213)
仍为失败：普通新标签与重开检查已运行通过，A独立检测的音频、地区23/low和SDK
门禁通过，但CreepJS保留1项 `unknown rotate dimensions`；B两个额外空白页在
会话准备中同时超时，未获得B/A重开独立结果。原始工件SHA-256已核对为
`9cf2e84eec886f37a9d6bc03576b7c921f7e6c5ad1a85a861d30d4a683aa1a23`。
当前补丁依次创建空白页、等待owner就绪、准备和导航，再创建下一页；不删页面、
不换检测器或延长native调用超时。是否解决共享renderer等待仍须下一轮实测。

固定CreepJS源码只在DPR=1时核对Blink旋转形状的固定散列；84头的A零异常
不能证明所有DPR都通过。当前增加只读DPR与CSS分辨率匹配记录，不改变DPR
以跳过该分支。旋转形状与任意数值扰动的矛盾仍未解决，不移除严格门禁。

最新已结束提交 `84ee857d32300ca2bd6e44efa655c19b09f7aa8d` 的
[Actions39458558806](https://github.com/lilyco-42/lyco-browser/actions/runs/39458558806)
中，真实 A 环境完成全部三组独立检测：CreepJS `totalLies=0`，社区地区检测
23分/low，BotD `bot:false`，音频静音头尾、有效信号及两种读取一致性全部通过。
官方工件与本地ZIP的SHA-256均为
`51ac4b6a77a4503b6c641b84ad3e8b13a5c6c148198a8f4ba912f3fe0c906460`。
该轮仍失败：B并行启动在调试端口就绪前超时，B和A重开未采集；便携包及安装
验收未运行，不能将A的通过当作完整产品验收。

前一轮 `9f4c7b5` / Actions39457543487 的A音频异常已消除，剩2项矩形异常。
其B额外启动页出现已暂停的页面，原生身份的直接页面调用在5秒超时；同一时刻
负责该页面的会话仍在执行初始化。当前修复将额外页面导航与直接运行时调用
放到所有权会话的身份准备、解除暂停确认之后。没有延长原生调用超时、修改
身份缓存或忽略失败。
`ee88767`的门禁随后发现普通新标签页首次读取内存8而配置4；后续读取才为4。
该次未运行独立检测，不能沿用上轮A通过结果。取消了未经原生验收的session/
direct-page应用记录合并，保留两个阶段恢复相同身份的原路径；新增回归要求
会话ACK不能抑制后续live-page准备，空白页必须先等owner就绪。新修复待实际CI。
端口启动失败的具体原因尚待核实；新增只读就绪探针统计，不新增请求、输出
端口/路径/凭据或重试启动。以上新修复仍须下一轮Actions实际验证。

产品提交 `9dbbf10e7e8930c94329a83f32db652058c690aa` 的
[Actions39413826487](https://github.com/lilyco-42/lyco-browser/actions/runs/39413826487)
已通过预检、便携包、实际安装 EXE 各38项检查，及6项安装/图标/卸载检查。
这包括普通模式新标签与同源/跨站框架、两标签原生会话恢复、并发 Worker
归属、存储和代理，以及账户引导的三种宽度/两种主题。

新增“恢复会话后再新开标签”的场景在 `276798f` 的预检及便携包已实际通过；
但该提交的便携包在并发检查失败：B 的隔离 JS world 读取CPU为4而配置为8。
安装验收被跳过。`f0e988a` 补充标准CDP原生CPU设置，仍待当前Actions实际验证。
这些已有检查也不是下面
第三方检测项目的通过记录。HTML Canvas/OffscreenCanvas 的既有差异见
[兼容性范围](FINGERPRINT-COMPATIBILITY.md)，没有将它包装成已解决的问题。

`f0e988a` 的预检通过，但便携包在原生Canvas独立性检查失败：保存种子不同，
图像结果却相同；尚未运行到并发CPU检查，不能据此声称CPU问题已消除。
该次证据草稿因PR令牌的GitHub API权限403未保存，仅有失败日志。工作流改用
Actions工件保存完整报告和截图，且在严格原生Canvas门禁前先采集独立检测结果；
原生断言保留，任一检测失败仍阻止通过。预检也运行独立检测，以免先花时间压包。

## 固定的第一方检测来源

| 项目与固定版本 | 用途、入口 | 当前状态 |
| --- | --- | --- |
| [CreepJS](https://github.com/abrahamjuliot/creepjs/tree/10aa6724cd33a1015db1574211890518cd04f0cc) | 原型矛盾、Window/Worker、Canvas/WebGL、字体、音频等；读取 `window.Fingerprint` / `window.Creep` | c3bd8b5实际A环境从67降为4项异常；B启动失败，未通过 |
| [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs/tree/d43c48aeffd66165e102036af79e956b1fbbf4e1) | `load({monitoring:false})` / `get()`；保存 visitorId 与 components，测同环境稳定与不同环境差异 | c3bd8b5的A组件门禁通过；252f2bc原始ID显示A重开稳定、B不同，整体门禁未过 |
| [BotD](https://github.com/fingerprintjs/BotD/tree/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47) | `load({monitoring:false})` / `detect()`、`getComponents()`、`getDetections()`；自动化识别 | c3bd8b5的A为bot:false，B未采集；252f2bc三场景均bot:false；整体未过 |
| [claude-tester](https://github.com/gokuscraper/claude-tester/tree/58a93a7b0304e40723c42f7fbe18035c1f353fdd) | 点击 `#scan-btn`，读取结果分数、风险档与每项信号 | c3bd8b5的A真实结果23分/low，B未采集；README称MIT但无LICENSE文件，不打入商品包 |

FingerprintJS 的 visitorId 不是“真人通过”结论；BotD 的 bot 判定也不是
地区或账号可用性证明。CreepJS 不发布同名公共镜像，保留来源和商标声明。

## Claude 相关说法的核查

[claude-tester 的实际检测代码](https://github.com/gokuscraper/claude-tester/blob/58a93a7b0304e40723c42f7fbe18035c1f353fdd/src/signals.ts)
只有六项启发式：时区30、语言24、中文字体20、Intl locale10、UTC偏移8、
Emoji风格8；总分≤30为low、≤60为medium，其余high。Emoji项根据UA/platform
推断，并未比较实际字形。它不读取Claude Code二进制、代理端点、system prompt、
IP或账户，也不调用Anthropic风控接口。这些权重不是已证实的官方规则。

另有研究者在 [anthropics/claude-code issue67120](https://github.com/anthropics/claude-code/issues/67120)
报告对2.1.169 win32-x64的静态分析，声称发现端点hostname与时区影响Unicode
标点选择。报告者未声称知道用途；该结论未在本项目独立复现，也没有Anthropic
人工确认。不能把这份报告与浏览器六项加权分数混为一谈，或据此推断国籍、
账号封禁与服务地区判定。浏览器通过这个网页也不能证明本机CLI的行为。

## Actions 接入与通过条件

1. 固定上述提交，保留许可证；检测源码只用于私有CI，不成为产品运行依赖。
2. 在实际产品窗口运行，保存版本、逐项原始结果、异常、截图与测试提交。
   网络失败、空结果、超时和跳过必须明确报告，不能换算成通过。
3. 同一环境重复运行及重开后保持预期稳定；两个环境并发时读取各自配置；
   停止B不改变A。没有采集到结果或SDK自行报错时，不能仅看visitorId字符串。
4. 核对语言/时区/Intl/字体等与用户所选环境的一致性，记录识别出的真实矛盾。
   不删中文显示能力、不改评分代码或伪造结果追求零分。
5. 单独报告开源地区启发式，不将它作为Claude官方准入认证，也不自动登录、
   发消息、支付或修改用户操作系统地区设置。

网络范围必须可审查：FingerprintJS/BotD使用本地bundle并显式关闭monitoring；
claude-tester首页有Google Fonts外链，不能直接称完全离线；CreepJS的WebRTC
使用Google STUN。若限制外网，则该STUN项须标记未测，并继续使用原生UDP
正反控制测试，而不是把断网造成的空结果判绿。

## Sannysoft 类检查

可固定 [FPCollect1163d0e](https://github.com/antoinevastel/fp-collect/tree/1163d0efd8deb9cf1866aa318d1884d56cbcb0bc)
和 [旧FPScanner46b93ce](https://github.com/antoinevastel/fpscanner/tree/46b93ce20f18d6f69f235b40a340ec5766fe667a)
作为可复现补充。FPScanner当前HEAD已经重写；没有证据证明这些固定文件与
Sannysoft线上文件逐字相同，故不称它们为“线上同版官方测试”。线上页面还有
第三方CDN/统计请求，应与私有可复现检查分开报告。

本文件是来源核验与执行待办，不是第三方全通过报告。

Windows工作流固定获取CreepJS已提交的静态页面，在Actions构建claude-tester，
仅通过Vite的base参数改变部署路径，不改检测逻辑。来源位于`fingerprint-audits/`，
与打包的`Browserapp`目录分离。新增便携包适配器使用真实产品环境，运行A、B并发、
A重开三个场景；只点击原页面按钮、只读结果，保存原始信号、截图、版本和哈希。
检测异常、缺少关键面、CPU/语言/时区错位、CreepJS报告矛盾以及社区结果非low均
阻止通过。不会要求不真实的零分，也不修改用户系统地区或移除中文显示。

FingerprintJS/BotD按各自Yarn锁文件构建，ESM bundle在同一私有来源加载并显式
关闭monitoring；原始components/detections保留。关键组件缺失或报错、BotD判为
bot、A重开的visitorId改变、A与B的visitorId相同，均阻止通过。SDK不进入商品包。

252f2bc已完成第一轮独立采集，但整体门禁未通过。当前getter/点击修复仍待
新提交的Actions运行，全套普通浏览兼容性仍待完成。外部HTTP被私有代理拒绝，
Google Fonts不能下载；Google STUN不纳入本套通过结论，另有本地UDP正反控制。

## 第一轮独立运行的证据与后续修复

[Actions39449928094](https://github.com/lilyco-42/lyco-browser/actions/runs/39449928094)
对应252f2bc，实际预检完整采集A、B并发、A重开三个场景，综合门禁失败，
便携包和安装验收未执行。Actions工件SHA256为
`d71f31a11492fe87fccea6632f67aefc10e2a80b777f566a5292537eb94cfc2c`。

CreepJS的67项来自七个Navigator属性各9项、DOMRect三项、AudioBuffer一项。
源码核对发现UA脚本用Navigator.prototype作为原生getter的接收者做相等性检查，
该调用按Web IDL规则会抛错，导致原本已经匹配配置的getter也被重复替换。
后续修复改用同一realm的真实navigator检查；原生值匹配则保留原getter，
确有差异时仍用既有配置回退。不伪造检测结果、不删除音频/Canvas噪声，
DOMRect和音频异常仍待处理，新修复必须另经CI验收。

社区检测的失败截图为idle，页面已complete；初始0分不是检测结果。适配器
改用Page.bringToFront与真实鼠标输入，记录click监听和Runtime/Log异常，并保留
未修改的三个绝对音频资源路径。不会直接调用scanner函数或写入页面结果。

## 第二轮：原生getter与真实点击的实际结果

`c3bd8b5` / [Actions39453809394](https://github.com/lilyco-42/lyco-browser/actions/runs/39453809394)
整体仍失败，当前不是可发布版本。工件SHA256已核验为
`a6b863e95000bf09170df5641020cea4fba9c442e0dc620e47e00a78388eda96`。

A环境实际CreepJS异常从67降为4，七个Navigator属性的63项消失；剩余是
DOMRect三项和AudioBuffer一项。社区页实际完成六项检测，23分、low：
时区/语言/Intl/偏移为0，保留中文字体贡献20、Microsoft风格贡献3。
没有删字体或改分数。SDK组件检查也通过；但B启动时原生身份恢复失败，
所以B和A重开均未采集，不能把A的结果当作全矩阵通过。

下一补丁保留渲染音频中原本为0的采样，避免给音源开始前和停止后的静音
添加杂音；非零采样仍用原环境噪声。新增实际OfflineAudioContext回归：
2048帧中512帧静音前导、512帧静音尾部，中段有声；两种读取一致，中段
散列同环境重开稳定、跨环境不同。并补充CreepJS几何/音频/执行错误的完整性
门禁，防止缺失这些模块后意外判绿。此补丁待新CI，未声称剩余4项已解决。

另外补充原生初始一次性CDP调用的独立诊断，记录固定方法名、时间、成功/
失败类别，不记录设备、参数、响应、URL或原始错误；原有1200条目标追踪
可能遗漏这条启动路径。并在既有只读native getter处比对Canvas种子与保存
缓存的散列/类型/相等性，避免仅凭“像素相同”猜测原因。未重试、延长超时、
绕过授权或改变身份失败时关闭页面的行为。

几何后续补丁保留原生空矩形，避免给0尺寸、0坐标的元素制造偏移；对有效
矩形仍保留同环境稳定、跨环境不同的位置/尺寸扰动，但将宽高与计算后的
浮点边界对齐。Element/Range的单个矩形、矩形列表及子窗口共用同一算法。
新增5000组负坐标、亚像素和缩放回归，并检查输入不被修改和环境扰动仍在。
该补丁尚待Actions；固定旋转形状这一CreepJS提示仍未证明解决，不做检测
页面、CSS类名、角度或URL的特殊处理。
