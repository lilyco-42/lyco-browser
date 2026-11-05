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

The initial source is prepared, not yet validated. Compatibility is only a
prerequisite: actual product bridge, ARM64 runtime, original-data/key handoff,
full routing/RTC/privacy, licenses and all five-platform release conditions
remain required.
