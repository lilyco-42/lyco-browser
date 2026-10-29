# Source-built native route experiment

The genuine stock-Gecko experiment 40820087794 at 95123ff has valid controls:
all nine applicable contexts complete real TURN TCP PING/ACK before and after
policy. With proxy_only active, native `nicer` logs record `use only default local
addresses: yes`, then `failed to find default addresses` and gathering error=10.
No TURN ingress is reached. Earlier 40819289946 has the same valid functional
failure, with less detailed logs. Neither is product readiness.

The published Maven POM pins Mercurial revision
`5add844c26613d7e4d84c799d6e23cf987b1240d`. Official Git tag
FIREFOX_159_0_RELEASE resolves to `9a2dc53c369c7ae5172018b35988e1d2ffeff402`.
The affected PeerConnectionImpl.cpp fetched from both official revisions has
identical SHA-256 `918068eebc2080e170de43acbf3d10c3643f7fe8a82102548e38025622129988`.
The build verifies that file hash and Git revision before applying any patch.

Source inspection connects the failure to default-address selection: it creates
an unbound UDP socket to query the kernel route without sending a datagram;
NrSocketBase::CreateSocket rejects UDP when forceProxy is set. The candidate fix
keeps actual pre-fetched interfaces for forced-proxy TURN TCP, rather than asking
for that prohibited default-route socket. It leaves the forced-proxy transport
flags, UDP prohibition, native host/related-address protections and real TURN
communication requirements intact. It grants no media permission, substitutes
no address, uses no page wrapper and disables no RTC API. Privacy and functionality
remain unproven for this modified engine until the same actual native gates pass.

Decision: compile this six-line native fix as a separate x86_64 experiment before
changing any product dependency or environment. A C++ change requires a full
source build; an artifact-mode build would not compile it. The manual Actions
source_engine_build input invokes a separate read-only workflow with no publisher.
Bootstrap, format, native compilation, packaging and archive-geckoview all run on
a disposable genuine hosted runner. Build/toolchain logs and the patched MPL file,
patch, source identifiers and dependency hash remain original evidence. All
acceptance and release claims are explicitly deferred; this build alone proves
neither runtime behavior nor full license/source delivery.

Root upstream AGENTS.md was read; no parent-specific AGENTS files exist along the
affected DOM/media/webrtc/jsapi path at this tag. Use mach for the build/format,
keep comments minimal, and do not submit upstream messages or patches without
human authorization. No upstream submission is authorized or performed here.

Primary sources:
- https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/159.0.20261022150525/geckoview-159.0.20261022150525.pom
- https://hg.mozilla.org/releases/mozilla-release/raw-file/5add844c26613d7e4d84c799d6e23cf987b1240d/dom/media/webrtc/jsapi/PeerConnectionImpl.cpp
- https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/dom/media/webrtc/jsapi/PeerConnectionImpl.cpp
- https://firefox-source-docs.mozilla.org/mobile/android/
- https://firefox-source-docs.mozilla.org/mobile/android/geckoview/contributor/geckoview-quick-start.html
- https://firefox-source-docs.mozilla.org/mobile/android/focus-android/Development-Custom-GeckoView.html

After a successful source build, dispatch build-universal with
native_engine_probe=true and native_engine_source_run=<successful run id>.
The consumer refuses incomplete/failed builds, different native source/patch or
builder files, wrong provenance/ABI and archive/AAR hash mismatches. A local Maven
module keeps the hash-pinned official 159.0 dependency POM graph while loading
only the compiled experiment AAR. The actual APK's native libraries must match
the AAR bytes, including libxul.so, before any runtime result is accepted. This
runs the same native before/after controls, all frame cases, real TURN and stopped
route negatives. No source-run input changes the product build or default engine.

Initial full-source dispatch 40821252708 cloned the pinned official revision and
matched the original file SHA-256, then stopped at git apply before bootstrap or
compilation: the minimal patch had no following context line. The patch now
includes the unchanged window-id assignment as following context; the six-line
native change and the full original-file/revision guards are unchanged. This
failed setup run produced no engine binary or runtime proof.
