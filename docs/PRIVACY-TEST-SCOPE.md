# 隐私测试范围与未验证项

本轮追加测试针对客户端可观测的一致性与泄露风险，不承诺“完全规避 Claude 检测”。
Anthropic 明确说明会使用 IP 和其他信号判断地区，用于安全、防滥用及地区资格，
这项用途不能在隐私设置中关闭：[官方说明](https://privacy.claude.com/en/articles/11186740-does-claude-use-my-location)。
账号处理还可能涉及使用政策、服务条款及不支持地区：[官方说明](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals)。

## 本轮新增门禁（合并和验收前均属待验证）

- 在受控页面的第一段脚本同步读取低熵 UA Client Hints，并保存真实 HTTP 请求头。
  验证品牌、Chromium 主版本、移动标记和平台与页面值、已选 UA 一致。
- 读取高熵架构、位数、平台版本及完整版本列表，比较同环境首次启动、重开、
  新标签、同源 parser frame 和保存会话恢复。不会修改这些 API 或请求头来求通过。
- 只读观察 WebGPU 是否可用、是否取得 adapter、实际 adapter 元数据。
  不申请设备或权限、不创建 GPUDevice、不修改 WebGPU/WebGL，不调用目标平台账号。
  WebGPU 采集不是与已选 WebGL 显卡一致性的通过结论；原始可用性和元数据须另外审阅。
- 缺失、错误或超时的必要 Client Hints 不能通过一致性门禁；WebGPU 的 unsupported、
  error、timeout、没有 adapter 均保留原样，不能解释为“已防泄露”。
- HTTP 请求只保留三种 Client Hints 头，不记录 Authorization、Cookie 或账号令牌。
  这些受控采集页只存在于 GitHub Actions，不加入出售的产品包。

这些检查与已有 CreepJS、FingerprintJS、BotD、社区 claude-tester、身份缓存、
Worker、代理和 WebRTC 门禁一起执行。旧提交的绿色结果不能证明本轮新增测试通过。

## 不能从 CI 推导的结论

| 范围 | 当前证据 | 仍然不能证明 |
| --- | --- | --- |
| CI 内的实际 LYCO 包 | 指定版本、指定 fixture 和浏览器 API 的原始报告 | 任意网站、任意未来检测都无法识别 |
| CI 公网检测 | GitHub runner 的真实产品页面、出口与原站结果 | 用户本机的订阅 IP、DNS、IPv6、UDP、TLS 或系统其他程序的出口 |
| 用户本机 | 需要确切安装包、实际配置和本机运行证据 | 仅凭 CI 分数证明本机没有泄露 |
| Claude 账号 | 官方公开的地区、安全及账号处理说明 | 可获得官方账号准入、防封或不会关联的承诺 |
| 社区“中国人检测” | 社区工具的公开信号和分数 | 国籍识别事实或 Anthropic 官方判断 |

既有 HTML Canvas / OffscreenCanvas 像素限制仍保留，见
[兼容性范围](FINGERPRINT-COMPATIBILITY.md)。代理异常、API 不可用与未验证项必须
分别列出；不能把缺少观测、禁用 WebRTC、第三方页面可访问或 CI 作业成功当成全部安全。

构建和测试继续只在 GitHub Actions 执行，除非用户明确修改本机测试约束。
