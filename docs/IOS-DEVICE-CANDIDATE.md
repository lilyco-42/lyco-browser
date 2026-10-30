# iPhone 真机编译候选

五平台发行需要验证 iPhone 真机产物。模拟器 `.app` 不能作为真机安装包。
`build-universal.yml` 提供独立手动输入 `ios_device=true`；同时保持
`signed_android=false`。此模式仅编译 iPhone ARM64 设备程序，不使用 Apple
签名材料，不发布 GitHub Release，也不运行 Android/Web/模拟器任务。
全部产品构建仍只在 GitHub Actions 执行。

候选包含源码构建的 Apple 网络核心、离线 JS 和原生浏览模块。CI 使用
`-sdk iphoneos -destination generic/platform=iOS`，核对主程序 Mach-O 平台为
`IOS`、Info.plist 支持 `iPhoneOS`、最低版本至少 17，并要求没有嵌入的
provisioning profile。生成的 Artifact：

- `LYCO-Browser-iOS-device-unsigned.ipa`：供后续签名使用的 Payload 结构。
- `IOS-DEVICE-PROVENANCE.json`：实际提交、运行 ID、版本及 SDK；明确记录未使用签名凭据、不能直接安装、尚无真机运行证据。
- `IOS-DEVICE-VERSION-PROVENANCE.json`：核对编译后 Info.plist 的版本、build 和应用标识与共同版本清单一致；该检查加入后的候选仍须重新在 Actions 构建。
- `IOS-DEVICE-SHA256SUMS.txt` 和 `ios-device-platform.txt`：下载完整性及设备平台记录。

该 IPA 尚不能直接安装到普通 iPhone。后续签名、设备授权与真机运行检查必须
独立完成，不能以构建通过代替代理、隔离、清除数据或断代理验收。

没有付费开发者会员时，可以使用自己的 Apple Account 进行个人设备开发测试；
Apple 说明 Personal Team 的设备 provisioning profile 在签发后 7 天到期，
这不是完成商业分发的证据。见
[Apple 开发者账户说明](https://developer.apple.com/help/account/basics/about-your-developer-account)。
第三方自签安装工具也有各自的设备配对、签名和续期要求，例如
[SideStore 官方 FAQ](https://docs.sidestore.io/docs/faq)。LYCO 的工作流不会要求或接收
Apple Account 密码、设备配对文件或第三方安装工具的凭据。

商业发行仍需真实签名身份及适用的分发渠道。此候选仅推进设备编译和后续
验证准备，不将个人测试签名、未签名 IPA 或模拟器证据计为商业发行完成。
