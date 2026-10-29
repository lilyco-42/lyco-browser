# 官方订阅与环境兼容性

调研日期：2026-10-29。目标是减少 LYCO 自身造成的环境混用和订阅操作误解；
验收对象是产品行为与真实观察。账号审核、付款审批和身份验证由服务商决定，
不能以“免风控”“免 KYC”作为完成标准。没有使用用户账号付款或提交身份资料。

## 证据与现有方案

| 方案 | 本次 GitHub 实查 | 适用范围与限制 | 决策 |
| --- | --- | --- | --- |
| [Waydroid](https://github.com/waydroid/waydroid) | 12,467 stars；GPL-3.0；最后推送 2026-10-16；只读克隆 `db7294c4c2bd43157bab94cf8a3015e22d9f1ad8` | Linux 容器运行 Android，README 说明使用 Linux namespaces 和 LineageOS 镜像；不能由此推断支付兼容性或账号准入 | 不集成新的 Android 运行时；没有解决本需求的可验证证据 |
| [Island](https://github.com/oasisfeng/island) | 3,988 stars；Apache-2.0；最后推送 2025-04-24 | Android 工作资料隔离是不同方向；不能将工作资料等同于另一台经过认证的设备 | 保留作为隔离调研候选，本轮不引入依赖 |
| [Android Emulator](https://developer.android.com/studio/run/emulator-troubleshooting) | 官方文档核对 | 官方记录过 API 37 镜像认证和 Google 登录故障；说明虚拟环境还增加了兼容性变量 | 仅用于后续兼容性测试，不声称已经完成真实支付验收 |
| LYCO 现有环境与检测入口 | 源码只读核对 | 已有四项网络检测和受控的环境内打开页面；没有 Google Play 内购能力 | 复用入口，补齐官方订阅与验证帮助 |

`gh search repos` 已检索 `android work profile isolation`、`android emulator google play`、
`android work profile`、`android isolation island`、`waydroid`；星数和更新信息是查询时快照，
不是可信度评分。没有复制候选项目代码，也没有安装或运行这些 Android 方案。

## 官方规则和社区线索

- Claude 支持在官方 Android 应用设置中开通 Pro：[官方流程](https://support.claude.com/en/articles/9612892-how-do-i-sign-up-for-claude-pro-on-claude-for-android)。浏览器环境检测不等于 Google Play 内购测试。
- Google 说明购买前可能要求核验身份和付款资料：[付款问题](https://support.google.com/googleplay/answer/1267137?hl=en)。
- Claude 说明部分功能或平台完整性检查可能触发身份验证：[身份验证](https://support.claude.com/en/articles/14328960-identity-verification-on-claude)。付款渠道不能作为免验证承诺。
- Google 将设备认证与 Play Protect 防恶意软件功能分开说明，未认证设备的应用功能可能不正常：[设备认证](https://support.google.com/googleplay/answer/7165974?hl=en)。不关闭防护，不伪造认证结果。
- [Reddit 的订阅同步报告](https://www.reddit.com/r/ClaudeAI/comments/1v9i8bv/the_google_play_subscription_sync_issue/)描述扣款成功而 Claude 仍显示 Free；[多账号付款报告](https://www.reddit.com/r/googleplay/comments/1sektd8/google_play_forces_wrong_account_for_inapp/)描述选错付款账号。这些是个案线索，无法据此估算发生率或推断风控原因；产品引导用户先核对原订单和两侧账号，不鼓励重复购买。

## 本轮决策与验收

复用现有环境检测控制器，增加单独的官方订阅帮助区域，避免新建虚拟机、存储支付资料
或模拟认证系统的高投入。只新增固定官方帮助地址，不提供自动付款、不读取账单或证件。

验收要求：

1. 四个原检测保持不变；官方帮助单独展示，不能显示“账号安全通过”等判断。
2. 页面只在用户所选且仍运行的环境打开。停止、撤权、环境变化时拒绝操作，没有宿主浏览器回退。
3. 帮助地址为固定 HTTPS 白名单，不接受 URL 参数、账号、Cookie、令牌或任意对象。
4. 网络检测与帮助共用操作锁，拒绝并发重复打开；失败后可以重试。
5. 中文、英文、浅色和深色界面可读；帮助折叠区在无环境时也能阅读说明，打开链接仍要求选择环境。
6. 单元测试和实际打包界面检查只在真实 GitHub Actions 运行；结果如实保留，不把自有夹具当成 Claude 登录、真实内购或平台审批证明。

后续商业化仍须完成既有五平台原生隔离、真实线路、签名和发行门禁。本轮帮助功能不能替代这些验收。
