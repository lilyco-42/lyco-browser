# LYCO Browser · 指纹/多环境浏览器与官方代理支付

**Windows x64 MVP，所有编译、测试、打包只在 GitHub Actions 进行。** 不允许使用开发机或生产服务器运行浏览器、构建 Electron 安装包或进行本地集成测试。

> **桌面公开分发暂停：** 安装包审计发现内核附带多个系统的字体库，尚无逐项字体再分发授权记录。桌面 Actions 继续进行功能验收，但产物只保留为仓库所有者可见的草稿，不应当作已获商业分发许可的商品。插件保持独立发布。指纹环境和字体功能接口保留；后续需要提供已授权字体库或经过验收的本机字体接入，不能直接删库后宣称完整指纹能力。

## 环境工作台（开发中）

参考[蓝鸟官方环境配置教程](https://www.blueniao.com/browser/?id=12)的分组、批量添加、双击启动和右键编辑流程，使用现有环境、代理和账户后端。分组在左侧，新建和批量添加默认使用当前分组；列表默认显示环境、网络、状态与操作，更多操作中可以展开全部详细列。右键菜单支持键盘导航和 Escape 关闭。品牌和图标继续使用 LYCO 原创资产，不复制蓝鸟图片或标志。

本分支只有在当前 Actions 的实际窗口操作、代理流量和编辑回归通过后，才能称为已验收；公开分发仍受上方资产授权门禁约束。

## 核心能力

- 基于 [OpenBrowser](https://github.com/sheying2013/OpenBrowser) 固定提交 `5fa3b9d0bd218a948da15820b35fe598c362eba0` 集成已有的 Chromium 多环境隔离、指纹配置、代理库、扩展、自动化/API & MCP。参考紫鸟、战斧的多窗口管理产品体验，不复制其品牌或私有实现。
- LYCO 专属「代理与会员」页面：网页登录 `https://lain42.top/studio/api/login`，通过 `/me` 确认有效 `proxy_1m` 权益，获取对应官网订阅，再使用官方 Mihomo 开启 `127.0.0.1:<随机端口>` HTTP 代理。
- **断开即停**：本地配置启用 `allow-lan=false`、禁用外部 controller；关闭时尝试停止受管 Mihomo，清理临时配置。推荐使用“一键创建专属代理环境”，自动选择本地代理；受管环境每次启动核对账号和月卡，并自动重绑定端口。手动导入仍可使用。
- 官方结算：打开现有商城 `https://lain42.top/shop/#proxy_1m`，订单、充值、支付宝/爱发电与积分兑换全部由线上 Billing 负责；**客户端不提交充值成功声明，也不含服务端秘钥**。
- JWT 只保存在 Electron **主进程内存**中，关闭程序后需要重新登录；密码不写入磁盘。没有已付款且有效的权益不能连接。
- 全部浏览器和代理联动是 MVP，不承诺自动绕过网站风控、100% 防关联或匿名性，请遵守目标网站的平台规则。

## 唯一编译与测试入口

GitHub → **Actions** → **Build LYCO Browser (Windows x64, GitHub Actions ONLY)** → **Run workflow**。

工作流：
1. 从指定不可变 SHA 获取 OpenBrowser 和 Windows 浏览器内核（保留第三方版权）；
2. 仅在 Actions 将 `src/` 和 `scripts/apply.js` 注入 OpenBrowser 源码；
3. GitHub Windows Runner 运行 JS 语法检查、`node --test`、OpenBrowser 官方安全/环境测试；
4. 从 **MetaCubeX/mihomo 官方 GitHub Release v1.19.32** 下载 Windows x64 内核；
5. 在 GitHub Actions 执行 NSIS 和便携包构建，并通过 `gh release upload` 上传 `LYCO-Browser-Windows-x64-MVP.zip`、`.exe` 到该提交的 **GitHub CI Prerelease**。

> GitHub Actions Artifact 存储配额不足，所以改为**每个提交对应的 GitHub 预发布版**（`ci-<SHA前12位>`）直接托管二进制；仍然只是内部测试构建，不代表正式上线或完成支付 E2E。

## 源码结构

```
src/network.js       # Billing、权限、订阅、Mihomo 代理；仅主进程执行
src/ui.js            # 页面交互（受 preload/IPC 严格隔离）
src/view.html        # 会员、代理和官方支付卡片
scripts/apply.js     # GitHub Actions 向 pinned 上游源码注入集成
tests/network.test.js
.github/workflows/build-windows.yml
```

## 权限与网络边界

- 代理必须**明确分配给环境**：推荐“一键创建专属代理环境”；仅对创建的受管环境绑定代理，不修改其他 profile。
- 付款必须由 **Billing 服务端校验**，客户端不直接对接支付商户凭据或提供后台管理员 API。
- 本地端口可能变化，受管环境会在启动时自动重新绑定；手动导入的旧环境仍需自行更新。批量启动共用同一次核心连接；退出或过期不会留下受管核心。
- OpenBrowser 依赖的浏览器内核/扩展需要独立审计。支付与代理业务会话请使用最小权限。

## 许可和归属

- 上游 OpenBrowser 仓库根目录声明 MIT：版权与授权请见 [OpenBrowser/LICENSE](https://github.com/sheying2013/OpenBrowser/blob/main/LICENSE)。
- 上游的 `native-input-mirror.cs` 引用了来自 **chrome-power（AGPL-3.0）** 的实现；保留上游的 `Browserapp/THIRD-PARTY-NOTICES.md`、`Browserapp/LICENSE.chrome-power.txt` 和对应源码，商业分发前应专门评估 AGPL 义务。
- 集成使用的 Mihomo 项目来自 [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)，原始许可证及内核再分发条款以对应上游仓库为准。不得移除上游浏览器内核和第三方的 LICENSE/NOTICE。
- LYCO 特定代码只是集成层，不代表整个复合安装包已经通过商业闭源分发的法律合规审核。


## React Native 全平台架构（2026-10-15）

共享源码在 `apps/universal/`，使用 Expo SDK 56 / React Native 0.85，包含 **官网登录、有效月卡检查、购买与续费、环境元数据本机持久化、移动端临时网页浏览**。这套 React Native 界面不调用管理接口、也不内嵌支付密钥或保存账户 JWT 到存储。

| 目标 | React Native 控制层 | 浏览器内核 | VPN 出口 | GitHub Actions 目标 |
|---|---|---|---|---|
| Android | RN/Expo 原生 APK | Android System WebView（临时页面） | 原生 VpnService 待做 | `build-universal.yml / android` |
| iOS | RN/Expo 原生 Simulator App | WKWebView（临时页面） | Network Extension 待做 | `build-universal.yml / ios-simulator` |
| Windows | RN Web 控制 UI + OpenBrowser 桌面版 | OpenBrowser Chromium | Mihomo 绑定独立环境 | `build-universal.yml / web` + `build-windows.yml` |
| macOS | RN Web 控制 UI + OpenBrowser 桌面版 | OpenBrowser / Wayfern（按上游分发） | Mihomo 绑定独立环境 | `build-universal.yml / web` + `build-desktop-unix.yml` |
| Linux | RN Web 控制 UI + OpenBrowser 桌面版 | Chromium / Google Chrome（按上游分发） | Mihomo 绑定独立环境 | `build-universal.yml / web` + `build-desktop-unix.yml` |

**不虚构移动端“防关联”能力：** React Native 和普通 WebView 本身不能保证独立指纹、设备参数伪装、WebRTC/DNS 防泄漏；`incognito` 是临时浏览，不等于每个环境都有独立浏览器存储或内核。iOS 替代浏览器内核需遵守 Apple 地区资格与 entitlement 规则。原生 VPN 需要单独实现并取得 Android/iOS 对应权限。现阶段 Android/iOS 只是 **可验证的多环境管理 + 会员控制 + 临时 WebView MVP**，不能宣称已具有桌面指纹浏览器的全部能力。

**支付合规：** 测试版可打开官网商城；Apple App Store / Google Play 正式上架时需按适用地区及类别检查应用内数字商品支付和外链政策，不能默认允许绕过商店支付限制。

**构建边界：** `npm install` / Expo prebuild / TypeScript check / Gradle / Xcode / macOS DMG / Linux tar.gz / Windows EXE 的构建和运行只能发生在 GitHub Actions runners。AgentDock 只处理版本管理、编辑、提交，不在设备/生产服务器上编译或执行。

Android 交付未签名 debug APK；iOS 交付**模拟器未签名 App**（无法直接安装在真实 iPhone，正式 IPA 需要 Apple Developer 证书）；Web 是 RN 控制台静态资源；macOS/Linux 是原生 OpenBrowser 发行包。**不要把 CI 源码检查等同于实际设备端到端验收或支付成功。**

## 路线

首版：Windows x64、独立环境、已有账户授权、官网支付跳转、本地代理绑定和 Actions 交付。

下一版：恢复登录（DPAPI 加密）、在线续费/订单状态回调、完整 UI branding、私有团队环境同步与权限模型。

## 浏览器扩展（开发版，以对应提交的 Actions 验收为准）

扩展代码在 `extensions/lain42/`，与桌面版共用网站账户和已有月卡，不新增自动扣费。它负责 Chrome / Edge 的网页代理；独立存储和指纹环境仍由桌面客户端管理。

使用当前提交通过 Actions 后生成的 `LYCO-Subscription-Extension.zip`：解压，在浏览器扩展管理页开启开发者模式并“加载已解压的扩展”。目前尚未提交 Chrome / Edge 商店，不能当作商店一键安装版本。

在桌面版“代理与会员”连接后点击“复制浏览器插件连接码”，粘贴到扩展并明确启用。私有 `lyco-fingerprint-browser` 可在已运行的本人专属环境“更多”菜单复制同一格式的 SOCKS5 连接码。连接码只有本机地址、端口和最长八小时的有效期，不含账户 JWT、节点口令或订阅令牌。

扩展不读取 Cookie、历史记录或网页内容。仅声明代理、会话存储和定时器权限，不请求任意网站访问权。客户端停止时不加入直连备用线路；连接码过期或浏览器重启丢失会话时暂停受管代理，用户可以重新导入或明确关闭，恢复浏览器原来的代理设置。扩展不会覆盖其他扩展或系统策略正在管理的设置。

Actions 同时运行协议/权限/到期回归，以及真实 Chromium 的扩展加载、启用代理、测试站点流量、核心停止、过期暂停和恢复原设置验收。测试不会创建真实订单或读取真实用户凭据。通过当前主分支全部门禁后才发布 ZIP 与校验值。

## 网站订阅专属环境（本轮开发）

“代理与会员”新增一键创建专属代理环境：登录已有网站账号、核对月卡后自动启动内置 Mihomo、在代理库保存本地线路并创建已选好代理的独立环境。再从环境列表点击启动即可，不需要用户记端口或手动绑定。

专属环境记录所属网站账号；每次启动重新核对账号和月卡，并自动更新重连后的本地端口。切换到其他网站账号或月卡失效时拒绝启动该环境；退出或断开会关闭受管窗口。已知月卡到期会停止本地核心。手动环境及原代理库操作保留。

不增加第二套月卡、不设置新的自动扣费。购买/续费仍显式打开 https://lain42.top/shop/#proxy_1m，由网站负责确认价格、充值和发货。用户可以选择其他代理源；本站受管环境的自动绑定只适用于本人有效网站权益。

Windows Actions 增加实际打包后的原生窗口验收：测试专属账号登录、代理绑定、真实 Mihomo 和内置 Chromium 的本地测试流量、跨账号启动拒绝和权益失效断开。Billing 只使用 CI 测试响应，不会创建真实订单，不能将它称作真实商户付款成功。预发布版本必须通过当前提交的验收。

图标复用已由内置 imagegen 生成的 Lyco 原创图，来源/许可在 resources/branding。ICO、ICNS 只在 Actions 转换，Windows EXE 使用包构建器的图标嵌入流程，原上游和 Mihomo 的版权说明继续保留。
