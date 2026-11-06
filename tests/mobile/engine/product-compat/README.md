# Actual Expo product dependency compatibility

The source-built Gecko engine passed independent x86 runtime checks; that does
not prove it can be integrated into the actual Expo 56 / RN 0.85 product.
The verified AAR's original metadata requires compile SDK 37, minor 2, while
the current product declares compile SDK 36. Original build/runtime and old
WebView data/keys remain intact.

This separate workflow first parses and retains exact sources in real Actions.
Only a manually dispatched `inspect=true` runs the dependency gate. It uses the
unchanged source downloader/verifier and only producer `41940576338`, then
copies Git-tracked product source to a disposable runner directory, installs
the original lock and runs ordinary Expo prebuild. It appends the source-engine
Maven dependency only to that private native module copy. The generated private
root build registers a local repository filtered to exactly that coordinate for
all projects, including the consuming app; both original and appended bytes
are retained. No other dependency can resolve from that local repository.

The task is the actual product's `:app:checkReleaseAarMetadata`. Its exit code
remains the job outcome; an incompatible dependency must fail. SDK checks,
minor SDK checks, plugin requirements and existing acceptance are not disabled.
Generated Android files, installed plugin catalogues, original/adapted module,
original source-engine metadata/POM, full Gradle log and actual outcome are
retained before deciding whether to upgrade the toolchain. There is no APK
build, signing key, engine entry point, page bridge, migration or runtime claim.

Research considered the MIT `ammarahm-ed/react-native-geckoview` wrapper
(Gecko106/SDK31) and Apache-2.0 `loopy-lim/yeoyu` (RN0.87.1/Gecko157/SDK37.1),
including their actual cloned source. Neither proves compatibility with this
product, engine or old profiles; no upstream code is copied here. See the
[official Gecko embedding guide](https://mozilla.github.io/geckoview/consumer/docs/geckoview-quick-start),
[Android tool requirements](https://developer.android.com/build/releases/about-agp)
and [Expo SDK matrix](https://docs.expo.dev/versions/latest/).

The actual original-product check
[42247213570](https://github.com/lilyco-42/lyco-browser/actions/runs/42247213570)
executed `:app:checkReleaseAarMetadata` and failed with five dependency issues:
the source engine requires SDK37; AndroidX core/core-ktx 1.19.1 requires SDK37
and AGP9.1.0. Actual product configuration was SDK36/AGP8.12.0/Gradle9.3.1.
Complete original source/evidence ZIPs, all receipt hashes, exact private module
and root appends, source pins and full job log were independently checked.
See the [unmodified result](../../../../docs/audits/gecko-product-compat-42247213570.json)
and [provenance](../../../../docs/audits/gecko-product-compat-42247213570.source.json).
The two earlier observer/repository preparation failures remain recorded;
this latest failure really reached the original metadata task.

The optional manual `toolchain=sdk58` candidate follows the
[official incremental upgrade guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/):
install the original lock, then request Expo57.0.0 and58.0.0,
running each SDK's ordinary dependency checks. Complete candidate manifests,
locks and actual installed versions are retained at both steps; all other
tracked product files must remain unchanged. There are no forced peer installs,
SDK/minor check suppressions or AAR metadata rewrites. Native generation and
the original metadata task run after these upgrades, retaining any failure.
Partial final manifests/locks survive an early failed upgrade. The default
remains the current product. This optional path is prepared, not yet validated;
SDK58's documented SDK37 does not prove the AAR's minor37.2 requirement.

Actual [42248634340](https://github.com/lilyco-42/lyco-browser/actions/runs/42248634340)
completed both upgrades and ordinary dependency checks. CLI `--fix` resolved
installed Expo57.0.32/RN0.86.3 and Expo58.0.23/RN0.88.1, rather than leaving the
requested initial patch versions installed. Both complete candidate locks and
actual version receipts are retained. The original metadata task executed and
failed with one remaining issue: engine API37.2 versus generated android-37.0.
Actual AGP9.2.1/Gradle9.4.1, all source/receipt hashes, root/module appends and
complete 345759-byte evidence ZIP were independently checked; see the
[unmodified result](../../../../docs/audits/gecko-product-sdk58-42248634340.json)
and [provenance](../../../../docs/audits/gecko-product-sdk58-42248634340.source.json).

The additional explicit `compile_platform=37.2` option requires `toolchain=sdk58`.
It installs the real `platforms;android-37.2` SDK and records its original
properties/install log. Only the generated private app and owned module receive
the public `compileSdk { version = release(37) { minorApiLevel = 2 } }` setting;
original/adapted bytes and exact additions are retained. Target/minimum SDK,
dependency metadata and version checks are unchanged. SDK default checks remain
available for comparison. This next platform option is prepared, not yet
validated; installation, DSL and metadata failures must remain failures.

Compatibility is only a prerequisite: actual product bridge, ARM64 runtime, original-data/key handoff,
full routing/RTC/privacy, licenses and all five-platform release conditions
remain required.
