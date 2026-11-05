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

`network_boundaries_test.go` adds actual IPv6 HTTP, CA-verified HTTPS and WSS
traffic through both authenticated local inbounds. Remote-only destination
names must reach the selected upstream unchanged. After stopping that upstream,
all requests must fail while independent direct controls still reach the origin.
The entire race-enabled suite passed in Actions 40550598220 at `92ddbd7`.
This is core evidence, not mobile WebView, DNS/RTC or device-VPN acceptance.
Manual workflow dispatch can set `routing_only=true` to run the full core suite
without rebuilding unchanged Android/Apple bindings; ordinary PR checks still
include both binding builds.

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

## Generated binding inputs

The native component workflow opts into Android generated-source capture with
`LYCO_CAPTURE_GENERATED_SOURCES=true`. Product builds leave it disabled. The
pinned binder's `-work` flag preserves temporary Go/Java trees, but its
[module-mode Android build](https://github.com/SagerNet/gomobile/blob/b2c30f47825831593d6980af8191527490f9c968/cmd/gomobile/bind_androidapp.go)
deletes the per-architecture copied package after compilation. Retaining the
temporary tree alone does not prove those exact copied inputs.

`capture-go-build.py` delegates to the original pinned Go executable. For the
two exact Android binding package directories only, it first copies source and
resolved locks, invokes the real compiler, then verifies the inputs stayed
unchanged. Compiler output size/SHA and ELF architecture are recorded.
`retain-generated.py` requires those two actual outputs to byte-match both AAR
libraries, retains Java and Go/Cgo work source, and records exact tool binary
identities, embedded Go build metadata and the compiler's actual NDK revision.
Only owned runner work/source directories are read; signing keys and runtime
data are outside the capture. Binary compiler intermediates are excluded.

The generated-source tar/SHA and raw receipts accompany the component artifact;
the verified Go source bundle also embeds the same tar and its AAR binding.
Its tested commit can be a PR merge commit, not the PR head; manifests record
the actual checked-out tree. Genuine Android component run
[41882642428](https://github.com/lilyco-42/lyco-browser/actions/runs/41882642428)
passed both compiler calls and retained 266 Java/Go/Cgo work files. Independent
inspection of both complete original ZIPs, the generated tar, both AAR ELF
libraries and their inline Go build information verified the recorded inputs
and actual output bytes. The parent source bundle also retained the exact
tested merge tree and 405 original module ZIPs; all ZIP CRCs, SHA-256 and
canonical Go module/go.mod checksums were checked. See the
[unmodified capture manifest](../../docs/audits/android-generated-bindings-41882642428.json)
and [independent source record](../../docs/audits/android-generated-bindings-41882642428.source.json).

That first parent bundle's outer `go.sum` had 380 additional checksum lines
after binding-tool dependency downloads. Both actual compiler locks survived
unchanged inside the generated tar, and the outer file retained every original
line, but its digest differed. The corrected opt-in source bundler now copies
the captured compiler locks, requiring both architectures to agree. This
packaging correction passed genuine
[41941420955](https://github.com/lilyco-42/lyco-browser/actions/runs/41941420955).
Both complete original ZIPs, all nested archives, both actual ELF/compiler
receipts, the 406-file tested merge tree and all 405 original module ZIPs were
independently checked again for this changed output. Both outer locks now
byte-match both compiler inputs, with zero additional checksum lines. The
[new unmodified manifest](../../docs/audits/android-generated-bindings-41941420955.json)
and [independent source record](../../docs/audits/android-generated-bindings-41941420955.source.json)
bind those exact bytes. The first archive is not retrospectively marked as an
exact outer-lock match.
In the first run Android succeeded but the overall run failed with Apple
cancelled, so that is not an all-platform pass. The newer component workflow succeeded including
Apple, but Apple generated-source capture is disabled and its runtime and full
source delivery remain separate requirements.
It does not establish correspondence to the older signed APK, all SDK/NDK
source delivery, license clearance, bit-for-bit reproduction, Apple capture or
commercial release. Original routing/build gates remain required. No local
execution or default product build change is part of this opt-in experiment.
