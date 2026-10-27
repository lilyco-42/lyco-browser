# LYCO mobile subscription core

A source-built, in-process sing-box integration for browser environment traffic.
It provides a loopback HTTP/SOCKS5 mixed listener with a single explicit remote outbound. It
does not install a device VPN, add a DIRECT fallback, accept arbitrary feed
inbounds/rules, or write node credentials and configurations to disk.

iOS uses the public SOCKS5 proxy configuration with random local credentials;
the unchanged native routing gate must verify this path. Closed listener ports stay reserved
until the app process ends. Android browser processes terminate on close.

Dependency: SagerNet/sing-box v1.14.4, source commit
c005f35300ce76427dc285481ec5695f5b179cd2. All builds and tests run in Actions.
The dependency is GPL-3.0-or-later; mobile distributions must retain its notices,
license and corresponding complete source/build instructions. This integration
is integrated into both native applications for paid and manual browser routes.
Native runtime gates remain mandatory; passing a Go or binding build alone does
not establish WebView/WKWebView routing or all-platform release readiness.

The native-binding Actions job also retains `lyco-mobile-core-source.tar.gz`
with the tested tracked application tree, resolved Go lock files, original module
ZIPs (including their license files), Go checksums and SHA-256 digests. It includes
the actual modules embedded in the pinned gomobile/gobind tools. See the archive's
README and manifest before reproducing a build. This is a network-core source
review bundle; npm, CocoaPods, Android dependencies, browser kernels and platform
SDKs still require their own inventory and distribution work.

Rebuild on Actions with Go 1.25.5 and `bash build-native.sh android` or
`bash build-native.sh apple`, from this directory. Android needs Java 17 and the
runner's Android SDK/NDK; Apple needs Xcode and the iOS simulator SDK. The binding
script pins gomobile/gobind 0.1.12, Android API 28 and iOS 17, and records the
generated native APIs alongside the libraries. Install the Android library with
`python3 install-android.py`; the Apple framework is copied into the Expo module's
`ios/Frameworks` directory. The application CI workflow records the remaining
Expo prebuild, native compilation and runtime acceptance steps.
