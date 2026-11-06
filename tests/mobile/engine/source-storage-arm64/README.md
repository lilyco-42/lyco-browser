# ARM64 archive of the validated storage and RTC source patch

This is a distinct build from the original queued RTC-only ARM64 run
`41812206227`, which remains untouched. Real x86 source producer `41940576338`
and its independently verified storage `41966583355` and RTC `41968477892`
experiments establish the source recipe to cross-compile; they do not prove
ARM64 runtime or product adoption.

The separate workflow derives a guarded Actions-only copy of the pinned
storage preparation. Before changing architecture, it requires all four
generated recipe hashes to exactly equal the successful x86 build. It then
changes only target triple, JNI directory and ABI metadata. The upstream RTC
and two storage sources, native optimization, Rust level, host credential and
resource containment, formatting/three-file allowlist, exact thirteen ELF
libraries and actual Maven publication byte checks remain required.

The verifier requires actual AArch64 ELF machine 183 and the exact RTC/storage
patch and source hashes from the successful x86 producer. Original and
generated files, caller guard, exact transformations, source and host receipts
are retained. No local preparation, parsing, compile or target execution is
part of this workflow. Compilation is opt-in only after real PR preparation
and syntax originals are verified; no original workflow or queued run is
cancelled, replaced or replayed.

The genuine [PR preflight 42069972627](https://github.com/lilyco-42/lyco-browser/actions/runs/42069972627)
passed preparation and Python/shell parsing. Its complete 34882-byte ZIP
(SHA-256 `e01b30d6a2bd5d026161da2ba74929a23adf642c76d68d9cbfc4a8d389f6169c`),
all eighteen files, four original pins, generated recipes, exact transforms,
CRC and full log were independently checked. See the [unmodified receipt](../../../../docs/audits/gecko-storage-arm64-preflight-42069972627.json)
and [provenance](../../../../docs/audits/gecko-storage-arm64-preflight-42069972627.source.json).

The distinct actual build [42070649430](https://github.com/lilyco-42/lyco-browser/actions/runs/42070649430)
completed source `643be4f` successfully. The complete compiled ZIP (85927053
bytes, SHA-256 `eb31dc638b105bd3b5e44d33364c0fe63c1bad087ed98f5c086a042537b945cb`)
and evidence ZIP (411832 bytes, SHA-256
`5c7a737a5c95fef7b45bffdf01522d8bee621e1cd7a77b46b76b74819c41f04a`)
were independently checked for size, SHA, CRC and safe paths. The actual AAR is
85915921 bytes, SHA-256
`a4c3829a81265f18555e526fbe84f23ff824c7e85c510cad9bd4092b9d13eb30`.
All thirteen original library sizes/hashes and AArch64 ELF machine 183 match
the retained result. All eighteen preparation files equal final evidence;
storage, architecture and verifier transformations were reconstructed as data,
without executing the helpers. Three changed upstream source hashes, optimized
compiler configuration, nine completed phases and actual host exit zero were
also checked. The complete 1078199-byte job log is retained. Maven publication
equality is supported by runner assertions/logs/receipts; duplicate published
AAR files were not exported for an independent byte comparison. See the
[unmodified result](../../../../docs/audits/gecko-storage-arm64-42070649430.json)
and [independent provenance](../../../../docs/audits/gecko-storage-arm64-42070649430.source.json).

Actual ARM64 runtime, old WebView data/key preservation, product bridge, performance,
license delivery and five-platform signing/distribution remain separate
requirements. No default installer or product engine is changed.
