# Isolated native localStorage write policy

The original combined storage gate is still failed. In genuine run
[41875833193](https://github.com/lilyco-42/lyco-browser/actions/runs/41875833193),
requesting the existing cookie timer preference at zero retained actual Cookie
values on all three original abrupt reopens. LocalStorage remained empty, while
IDB, the original non-exportable CryptoKeys, export rejection and same-ciphertext
decryption survived. The complete 97866424-byte original ZIP (SHA-256
`23b80fa74988c1c8bb739665cd7db9e7e104bea5d7384c4b894f8167f1f20a3e`),
CRC, full logs, source receipts and all thirteen libraries against the original
optimized AAR were independently verified. Every original nine-phase data/key,
route, clear and process gate remained required. This narrows the next change;
it is not complete persistence or a synchronous disk fence.

Pinned upstream [LSNG Connection](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/dom/localstorage/ActorsParent.cpp)
schedules a database transaction after a hard-coded 5000ms delay, downstream of
snapshot checkpointing. The public Java StorageController offers no flush
fence. Changing snapshot idle timing is not evidence of a database commit; old
storage implementations, test APIs, fixture waits and state replay are not used.

The new patch introduces only an ordinary production preference,
`dom.storage.database.flushIntervalMs`, for that existing database timer. It
retains the upstream 5000ms default and uses an atomic mirrored preference on
the existing background thread. Snapshot checkpointing, transaction/usage-file
commit, storage format, key serialization and the original RTC route patch are
unchanged. A zero request can queue writes earlier but remains asynchronous:
runtime persistence, performance and I/O costs still require actual testing.
No product adopts this patch or receives the new preference yet.

Dispatch the universal workflow with `source_engine_build=true`,
`source_engine_abi=x86_64`, `native_engine_storage=true`; leave probe and other
build inputs false/empty. A separate read-only reusable job checks all four
tested base-file hashes and the exact new patch hash, then derives a private
runner recipe. Original builder/host/route patch and the queued ARM64 adapter
are never edited. Both outer and reusable workflow concurrency groups are
separate from the existing queued source build, which must not be replaced.
It preserves pinned upstream, full native optimization, Rust
level 2, absent native debug symbols, original resources and actual Maven/AAR
byte-equality gates. Formatting of all three explicitly named modified source
files runs in Actions. Android Java/Kotlin formatters are skipped because this
patch changes neither language. The
changed-source allowlist is exactly the existing RTC C++ file plus LSNG C++ and
StaticPrefList; unknown changes fail. The route patch and route C++ checksums
must remain identical to the previously verified source build.

Before the long compiler, the job retains all original/generated recipe files,
exact transformations, hashes and the actual unchanged host preflight. After
compilation it retains the actual two modified storage sources, applied patch,
original logs, compiler config, full AAR/CRC, all thirteen x86_64 ELF identities
and actual Maven publication bytes. Compile output is not runtime proof. A
future consumer must separately verify every original archive and run the
unchanged abrupt data/key gate with explicit requested policy, then test
privacy and all original before/after/stopped controls on the changed native
binary. Old passing RTC results cannot establish the new binary's behavior.
ARM64, old WebView data/key migration, product integration and all other
five-platform commercial requirements remain open.

All preparation, syntax, formatting, compilation and new runtime checks happen
in genuine GitHub Actions. No local helper execution, automatic retry or gate
reduction is part of this experiment.

The first storage-policy build
[41878180913](https://github.com/lilyco-42/lyco-browser/actions/runs/41878180913)
stopped before compilation. Its full original 315109-byte evidence ZIP (SHA-256
`5b203975afe72ed76b9e3e7f00871e481ce693f5425d479cc87e0d28d8501c30`)
passed independent size, digest and CRC checks. Actual native compiler
configuration retained optimization and disabled native debug symbols. The
unqualified formatter selected outgoing upstream history as well as the workdir:
50 files changed, instead of the declared three, and `git diff --check` rejected
unrelated whitespace. It also attempted Android Java/Kotlin Gradle formatting
before the required native build had produced `buildid.h`. The corrected
adapter names every modified file and skips those unrelated language formatters;
the three-file allowlist, whitespace checks and all original compile/archive
gates remain mandatory. This is a build preparation fix, not a compiled archive
or storage durability result.
