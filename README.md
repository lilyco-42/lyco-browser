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
5. 在 GitHub Actions 执行 NSIS 和便携包构建，并上传 `LYCO-Browser-Windows-x64-MVP.zip`、`.exe` 到 Actions **Artifacts**。

> Artifact 与 Release 不同：当前构建完成后需从 Actions 对应 run 下载，**并不代表已经发布 GitHub Release**。任何用户体验和付费账户 E2E 都需额外人工验收。构建前不允许声称付费链路已经支付验证成功。

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

## 路线

首版：Windows x64、独立环境、已有账户授权、官网支付跳转、本地代理绑定和 Actions 交付。

下一版：环境与代理自动重绑定、恢复登录（DPAPI 加密）、在线续费/订单状态回调、完整 UI branding、私有团队环境同步与权限模型。
