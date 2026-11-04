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

Replacement 40822075594 completed bootstrap and patch application, then stopped
at the diff whitespace guard before native compilation. Unscoped `mach format`
selected unrelated upstream files (the original formatter log reports 84 fixes).
The builder now passes only the affected C++ path, as documented in the official
GeckoView contributor guide, and preserves the changed-file list and patched
source before checking the exact single-file and whitespace guards. Neither
guard is relaxed. This failure produced no compiled dependency or runtime proof.

The second attempt of 40853280935 ended with exit 143 and an explicit runner
shutdown at 2026-10-29T15:58:49Z. Its last visible source check passed; all remaining
output had been redirected into files on the lost runner, so neither the exact
interrupted phase nor a compiler failure can be established from that attempt.
No AAR was retained. The builder now streams every original phase log to Actions
as well as its artifact file, and records phase, status and exit code in
BUILD-STATE.json. A failed command still fails the build through pipefail;
source/patch/ABI/acceptance guards are unchanged. This improves diagnosis of
interrupted builds, and is not evidence that the native fix compiles or works.

The streamed replacement 41439355235 completed bootstrap and the single-file
format/diff guards, then entered native compilation at 2026-11-02T11:52:38Z.
The runner again shut down at 12:19:39Z with exit 143; no AAR or evidence artifact
was uploaded. The original job log establishes that compilation was active,
but does not establish an out-of-memory cause or a C++ diagnostic failure.
The next builder records memory, swap and process RSS every 30 seconds in the
live log and evidence file, uses one C++/Rust build job and one Gradle worker,
caps the Gradle heap at 2 GiB and stops retaining its daemon between tasks.
These are disposable build-host settings only: the release optimization,
native patch, source/ABI checks and downstream runtime gates are unchanged.
Gradle user-home properties and their precedence follow the
[official build-environment documentation](https://docs.gradle.org/current/userguide/build_environment.html).

Resource-limited run 41445348901 is now terminal: the hosted runner lost
communication at 2026-11-02T14:04:22Z. Its logs API returns BlobNotFound and
its artifact list is empty. No compiler result or memory diagnosis is available.
The next build uses a separate non-root systemd service, reserves at least 2 GiB
and CPU capacity for the runner, and verifies the actual cgroup before compiling.
That small preflight is uploaded before the long build. An observer outside the
build group records memory events, peak usage, disk availability and unit exit
status; no unbounded fallback is allowed. The downstream consumer binds this
wrapper as well as the builder, patch and workflow to the successful source run.
The native patch, optimized release build and all runtime gates remain unchanged.
This uses documented [systemd resource controls](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
and [systemd-run](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html).

Host preflight 41552388207 stopped before compilation: the initial wrapper
incorrectly assumed memory.max exists on the v2 root. Its complete 925-byte
evidence ZIP was verified by SHA-256 and CRC; the host had 15 GiB RAM, 3 GiB
swap and 103 GiB available disk. The wrapper now reads existing ancestor limits
and still requires exact effective limits on the new child. The hierarchy-root
exception follows the [kernel cgroup v2 conventions](https://docs.kernel.org/admin-guide/cgroup-v2.html#conventions).
Run 41552695786 validates the corrected wrapper; neither run proves the native
patch or runtime behavior. The Python shared-library tool path is explicitly
preserved without passing Actions authentication variables to the child.

Run [41552695786](https://github.com/lilyco-42/lyco-browser/actions/runs/41552695786)
ended at the hosted job's six-hour limit on 2026-11-03, not with a compiler
success or an OOM diagnosis. The full original evidence ZIP is 166000 bytes,
SHA-256 `3d82720b60794229033fb4198eb5afb35144fc4b5d426b11975ecea739b5b931`;
size, SHA and CRC were verified. Bootstrap and the single-file checks passed;
compilation started at 00:32:50Z and its last printed crate was gkrust at 37:19.
No AAR was produced. The 719 group-external samples record 26058601 soft-limit
reclaim events, zero hard-limit/OOM/kill events, a peak of 11792769024 bytes and
at least 76342099968 bytes of free disk. The final Rust process used about
10 GB RSS and the group's final full memory-pressure average was about 70%.

The next bounded experiment raises only MemoryHigh from 85% to 95% of the same
MemoryMax. The host reserve, hard memory cap, swap cap, CPU cap, non-root and
authentication-environment boundaries remain. The native six-line patch,
optimized release configuration, single C++/Rust build job and downstream
runtime gates are unchanged. The original soft limit was below the observed
working set; the [kernel's memory.high documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files)
explains its reclaim/throttling behavior. This is an evidence-based hypothesis,
not proof that the new threshold compiles or fixes RTC. Its actual child-group
limits must still pass the original strict preflight before compilation.


### Second bounded build: terminal evidence and symbol configuration

[41590673052](https://github.com/lilyco-42/lyco-browser/actions/runs/41590673052), source `928d07d`, also reached the genuine six-hour job limit; it ended cancelled at 2026-11-03 12:35 UTC. No AAR or compiled-patch proof exists. The original 167164-byte ZIP (SHA-256 `7c8ed0c92ce88683251b4678f33988854a40cb3b06e722d0e740d4429d489246`) is fully size/hash/CRC verified. Its 719 host samples still show 23295282 soft-limit events, zero hard-limit/OOM events, peak 13254905856 bytes and final full memory pressure avg300 78.33%. The last compiler print is `gkrust` at 34:56; this is continued reclaim pressure, not a compiler diagnostic or successful native build. Increasing the soft boundary alone did not resolve it.

The next experiment explicitly disables debug symbols while retaining `--enable-optimize`, Rust optimization level 2, the same source/patch, single compiler job, host hard/soft memory/CPU/swap/reserve limits, and all runtime gates. The pinned [toolchain configuration](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/build/moz.configure/toolchain.configure#L2249) treats symbols separately from debug mode; the [Rust configuration](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/build/moz.configure/rust.configure#L735) adds full debug information when symbols are enabled. This supports a compiler-memory hypothesis. The old generated compiler flags were not archived, so their actual values are not independently proven by that run.

A separate configure phase now records selected actual `autoconf.mk` substitutions and its SHA-256 before compiling. It refuses disabled optimization, a Rust level other than 2, debug mode/symbols, or full Rust debug-info flags. The upstream [configuration environment](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/python/mozbuild/mozbuild/backend/configenvironment.py#L100) documents how substitutions enter this file. Actual configuration success will establish only those settings; compilation, AAR provenance and all original RTC/TURN/context/storage/route gates still require their own genuine Actions results. There is no further soft-limit-only retry, codegen-unit change, optimization downgrade, unbounded host fallback or product-engine adoption in this change.

The genuine source run [41746470057](https://github.com/lilyco-42/lyco-browser/actions/runs/41746470057), source `8c8bf8f`, ended with failure at 04:16:40 UTC on November 4. Its full original 158588-byte evidence ZIP, SHA-256 `8ccc02ddacbc9ebb779f35e1a8d73b03f3dbbf1d5110d631fb1c2433cec1e637`, and complete job log were retained and verified. Actual configuration proves optimized native mode and Rust level 2 with native debug mode/symbols disabled. Unlike the prior timed-out runs, `mach build` completed successfully after 222 minutes; package and archive commands also succeeded. Final collection failed with `Expected one native release AAR, found 0`. No AAR was uploaded, so this run remains ineligible for the runtime consumer. Successful compilation does not prove RTC privacy or a usable binary.

### Published AAR variant and native optimization are separate

The collector incorrectly assumed an AAR with `release` in its filename. At the exact pinned revision, upstream [gradle.configure](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/mobile/android/gradle.configure#L49) explicitly selects the `debug` Gradle variant. Its [GeckoView publication](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/mobile/android/geckoview/build.gradle#L407) publishes `components.debug`; a later comment explicitly excludes the release variant from distribution. This name does not override the independently verified optimized native compiler configuration.

The corrected collector requires the actual configured upstream variant and publication task, exactly one source-built AAR containing x86_64 libxul, valid ZIP CRC/classes/manifest and no other native ABI, and byte equality with the actual generated upstream Maven publication. It retains a complete AAR path/hash/native-entry inventory and selected-publication provenance. Native optimization, disabled debug mode/symbols, the six-line patch, source identity, host resource limits and all downstream RTC/TURN/context/storage/stopped-route gates remain required. Phase history now retains every completed/failed phase, including collection, so successful archive output cannot conceal a later collector failure. The next genuine build must prove these changes; this correction alone provides no AAR or runtime acceptance.

The corrected genuine build is [41772782539](https://github.com/lilyco-42/lyco-browser/actions/runs/41772782539), source `6911044`, dispatched once after confirming the prior source build was terminal. Its four bound source-builder inputs must remain unchanged while live. Only a successful run with the complete original AAR/provenance/ABI checks can feed the unchanged full native-engine runtime experiment. The successful compilation in failed run 41746470057 is diagnostic evidence, not an eligible substitute.

This run's own host preflight passed. Its complete 812-byte original ZIP, SHA-256 `d4bbed2e5d7b7a5bcc103a8da36cf298271809f83c1f5986632af2dcb4386ae4`, was independently size/hash/CRC verified. The actual memory max/high are 13408276480/12737859584 bytes, swap cap 1073741824 bytes and CPU quota 300%; the reserved 3352072192 bytes follow the same host-reserve policy. One-page differences from the previous host do not change that policy. This is containment evidence only; the corrected collection and new AAR remain pending.
