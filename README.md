# LYCO Browser · 指纹/多环境浏览器与官方代理支付

**Windows x64 MVP，所有编译、测试、打包只在 GitHub Actions 进行。** 不允许使用开发机或生产服务器运行浏览器、构建 Electron 安装包或进行本地集成测试。

## 核心能力

- 基于 [OpenBrowser](https://github.com/sheying2013/OpenBrowser) 固定提交 `5fa3b9d0bd218a948da15820b35fe598c362eba0` 集成已有的 Chromium 多环境隔离、指纹配置、代理库、扩展、自动化/API & MCP。参考紫鸟、战斧的多窗口管理产品体验，不复制其品牌或私有实现。
- LYCO 专属「代理与会员」页面：网页登录 `https://lain42.top/studio/api/login`，通过 `/me` 确认有效 `proxy_1m` 权益，获取对应官网订阅，再使用官方 Mihomo 开启 `127.0.0.1:<随机端口>` HTTP 代理。
- **断开即停**：本地配置启用 `allow-lan=false`、禁用外部 controller；关闭时尝试停止受管 Mihomo，清理临时配置。每个浏览器环境需在「代理库」选择本地端口；不要给需要固定在线的长期环境依赖临时动态端口（下一版实现自动重绑定）。
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

- 代理必须**明确分配给环境**：MVP 用「连接代理 → 导入代理库 → 环境编辑指定代理」，并不会默认代理所有 profile。
- 付款必须由 **Billing 服务端校验**，客户端不直接对接支付商户凭据或提供后台管理员 API。
- 当前每次启动端口可能不同；连接重试时应重新选择代理库中对应的新端口。下一版做持久环境映射、VPN 自动重连、统一付款状态推送。
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

下一版：环境与代理自动重绑定、恢复登录（DPAPI 加密）、在线续费/订单状态回调、完整 UI branding、私有团队环境同步与权限模型。

## 网站订阅专属环境（本轮开发）

“代理与会员”新增一键创建专属代理环境：登录已有网站账号、核对月卡后自动启动内置 Mihomo、在代理库保存本地线路并创建已选好代理的独立环境。再从环境列表点击启动即可，不需要用户记端口或手动绑定。

专属环境记录所属网站账号；每次启动重新核对账号和月卡，并自动更新重连后的本地端口。切换到其他网站账号或月卡失效时拒绝启动该环境；退出或断开会关闭受管窗口。已知月卡到期会停止本地核心。手动环境及原代理库操作保留。

不增加第二套月卡、不设置新的自动扣费。购买/续费仍显式打开 https://lain42.top/shop/#proxy_1m，由网站负责确认价格、充值和发货。用户可以选择其他代理源；本站受管环境的自动绑定只适用于本人有效网站权益。

Windows Actions 增加实际打包后的原生窗口验收：测试专属账号登录、代理绑定、真实 Mihomo 和内置 Chromium 的本地测试流量、跨账号启动拒绝和权益失效断开。Billing 只使用 CI 测试响应，不会创建真实订单，不能将它称作真实商户付款成功。预发布版本必须通过当前提交的验收。

图标复用已由内置 imagegen 生成的 Lyco 原创图，来源/许可在 resources/branding。ICO、ICNS 只在 Actions 转换，Windows EXE 使用包构建器的图标嵌入流程，原上游和 Mihomo 的版权说明继续保留。
