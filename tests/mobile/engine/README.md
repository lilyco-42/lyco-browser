# Standalone native engine capability experiment

This builds a separate, non-debuggable test application, not LYCO Browser. It does
not replace the product engine, add a product test entry point, or migrate any
existing environment or website data. All builds/runtime are genuine Actions only.

Dispatch the existing `build-universal.yml` with `native_engine_probe=true` and the
other inputs left at their defaults. Gradle 9.3.1 / AGP 9.1.1 compile SDK37.0;
target SDK36/min SDK28 match the retained ced08fe product badging, with the same
API35 device as its native probe. The official
Mozilla Maven metadata selected stable GeckoView `159.0.20261022150525`; it is pinned
here instead of taking a moving latest/nightly version. Actual resolved dependency
hashes, original badging, source/run, and disposable experiment signature scope are
retained. This signing identity is not the owner product certificate.

Public `GeckoRuntimeSettings.Builder.configFilePath` applies native proxy settings
and `media.peerconnection.ice.proxy_only` before engine startup. Mozilla's
`toolkit/components/extensions/parent/ext-privacy.js` maps its documented
`privacy.network.webRTCIPHandlingPolicy=proxy_only` to that preference. No page
constructor, candidate, SDP, statistic or function text is rewritten. Controls use
the same APK/engine without the proxy-only policy, before and after the policy run.

The shared real network fixture checks ten first-script/frame/configuration cases,
including initial about:blank, nested blank frames, `window.frames`, and
`contentDocument.defaultView`. Raw candidate events, SDP, local-candidate stats and
native configurations are retained. Native policies can apply below the page API;
their `getConfiguration` result is observed, not forced to match a JavaScript shim.
The network/address and real TURN TCP PING/ACK positive and stopped-route negative
gates remain mandatory in every applicable context, including blank frames and
constructor/configuration variations. Successful original getStats and SDP reads
are mandatory. Unprotected positive controls need real relay communication, while
the protected run additionally rejects device/related addresses. The proxy endpoint itself is device loopback, matching
the product's native-core architecture. Three real loopback HTTP targets must also work in
both direct controls and use the selected upstream when policy is enabled. Missing
IPv6 or a broken control invalidates that proof; it is not skipped.

Stopped/recovery actions use ordinary fragment navigation in the owned fixture.
The Activity displays the actual document title through ContentDelegate, letting
native UI confirm completion before proxy recovery uploads the retained raw report.
There is no evaluateJavascript, content bridge, fake native observation or TLS
verification bypass. Any failure remains evidence, not product readiness.

Primary sources:
- https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/maven-metadata.xml
- https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/GeckoRuntimeSettings.Builder.html
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/mobile/android/geckoview/src/main/java/org/mozilla/geckoview/GeckoRuntime.java
- https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/components/extensions/parent/ext-privacy.js
- https://developer.android.com/build/releases/agp-9-1-0-release-notes

Initial Actions run 40732014774 stopped at AAR metadata validation: current
GeckoView and AndroidX Core require compile SDK37, with Core requiring AGP9.1+.
The experiment toolchain now follows those requirements; API35 and the
strict native behavior tests are unchanged. No runtime result came from that run.
Run 40732467759 stopped before compilation because sdkmanager was absent from PATH;
the build now locates the installed Android command-line tool explicitly.
Run 40732958680 showed that the hosted runner also lacks ripgrep; tool discovery
uses its available find command, with no new runtime dependency.
Run 40733512037 identified the published SDK package name mismatch. Google's
repository lists `platforms;android-37.0`, so the build uses that package and the
public compileSdk minor-level DSL instead of requesting nonexistent android-37.
The initial experiment scaffold used target35. Inspection of the actual retained
product badging identified target36/min28, and these are now required in the
compiled experiment badging instead of assuming a match from the device API.
