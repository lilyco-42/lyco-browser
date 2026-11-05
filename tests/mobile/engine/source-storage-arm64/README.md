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

The code is prepared, not yet validated. The final archive, actual ARM64
runtime, old WebView data/key preservation, product bridge, performance,
license delivery and five-platform signing/distribution remain separate
requirements. No default installer or product engine is changed.
