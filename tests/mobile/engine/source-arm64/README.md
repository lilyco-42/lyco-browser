# ARM64 source archive before product integration

The x86_64 source build 41772782539 and native experiment 41810285687 have
completed. This job addresses the separate ARM64 archive requirement without
changing those four bound builder inputs or treating x86 runtime evidence as
ARM64 runtime evidence.

Mozilla's [GeckoView build guide](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/contributor/for-gecko-engineers.html#mozconfig-and-building)
describes selecting aarch64 for physical Android phones; its
[Android aarch64 instructions](https://firefox-source-docs.mozilla.org/js/build.html#spidermonkey-on-android-aarch64)
show the explicit `aarch64-linux-android` target. This is a native source build,
not artifact mode. The pinned Firefox revision and original C++ file checksum,
six-line patch, one changed upstream file, optimized native/Rust level 2,
disabled native debug symbols, exact Maven publication bytes, phase records
and constrained non-root host remain required.

Run the existing universal workflow with `source_engine_build=true` and
`source_engine_abi=arm64-v8a`. The separate read-only reusable workflow first
checks all four immutable base-file SHA-256 pins from the successful x86 build.
It derives a private runner copy with exactly four architecture substitutions:
one target, two JNI directory occurrences and one ABI provenance field. No other
script, source or resource policy is changed. Original and generated scripts,
precise substitutions and SHA-256 values are retained before compilation.

The archive collector keeps the existing AAR CRC/classes/manifest, ABI-directory
and exact Maven-published byte gates. A second verifier checks every native entry
for ELF64 little-endian AArch64 machine 183, records every library digest, and
requires the exact same applied patch and resulting C++ file as the successful
x86 source build. A successful archive can establish compile/architecture/source
identity only. It does not establish ARM64 runtime, product engine adoption,
independent environments, old storage/non-exportable CryptoKey migration,
customer egress, iOS, complete corresponding-source delivery or release approval.

All preparation, syntax, compilation and new runtime checks run in genuine
GitHub Actions. There is no local execution or automatic runtime retry.
