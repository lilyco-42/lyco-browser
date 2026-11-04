# Cold Gecko profiles before product integration

This separate genuine-Actions capability run consumes only successful source
build 41772782539, whose independent RTC/TURN/context/loopback experiment already
passed in 41810285687. It does not rerun or replace those unchanged 29 checks.
The product, its retained signature, original WebView profile roots and data are
untouched. ARM64 compilation runs separately with its frozen recipe.

Dispatch the universal workflow with `native_engine_probe=true`,
`native_engine_source_run=41772782539`, `native_engine_storage=true`.
The existing source identity, complete archive SHA/CRC, exact AAR, non-debuggable
experiment signing and every packaged native-library byte comparison still run.
The extra activity exists only in the standalone experiment APK.

Nine ordinary pages use the same `http://localhost:18080` origin via an owned
HTTP proxy, with independent proxy body receipts. There is no page bridge or
injected storage result. Native startup selects an explicit canonical application
no-backup root for A or B using the same public `-profile` argument as the proven
RTC experiment. Every step first force-stops and observes absence of the package
and all its subprocess names. The nine phases are initial empty A, seed A,
initial empty B, seed B, cold reopen A, cold reopen B, empty A after clear A,
unchanged B after clear A, and empty B after clear B. Native clear operations are
separate cold launches and remove only the exact owned UUID root without
following links. Actual completion UI and subsequent empty browser storage are
both required; no product environment-list deletion is claimed.

Seeds write real Cookie/localStorage/IndexedDB values, create a non-exportable
AES-GCM CryptoKey, structured-clone the actual key into IndexedDB and retain an
encrypted record. Read phases never generate a replacement key: they must load
the same key, reject raw export with InvalidAccessError, decrypt the old record,
and preserve its ciphertext digest. B must remain independently usable after A
is cleared. Empty phases must have no retained key. No raw key, IV, ciphertext or
private database is uploaded; only synthetic seed values, ciphertext SHA-256,
API outcomes, transport observations, process-close receipts and UI/logs remain.

The [WebCrypto API](https://w3c.github.io/webcrypto/#cryptokey-interface) defines
CryptoKey serialization and extractability; the
[Secure Contexts algorithm](https://w3c.github.io/webappsec-secure-contexts/#is-origin-trustworthy)
describes trustworthy loopback origins. These documents motivate the test; the
test separately requires the actual browser's secureContext and crypto outcomes.
It does not disable TLS checks or simulate real trusted HTTPS.

A passing result proves this x86_64 engine's owned per-profile storage capability
only. It does not prove WebView-to-Gecko migration, portability of non-exportable
keys across engines, ARM64 runtime, a complete product bridge, real customer
routes, all-network privacy, iOS, licensing/source delivery or commercial release.
All original product requirements and legacy data remain required.

The first run [41813877950](https://github.com/lilyco-42/lyco-browser/actions/runs/41813877950)
completed all nine original observations and failed three strict reopen checks:
Cookie/localStorage were empty after abrupt force-stop, while IndexedDB values,
non-exportable key use, export rejection and identical encrypted records survived.
Its complete 97923694-byte original ZIP (SHA-256
`940e30e4b2d7e91fd9389f12c7df6dfe14ece8ee40b7562b1ef0aa471b02766a`)
and raw reports were verified and retained. This is a real failure, not a pass or
a claim that all storage is lost. The original driver did not request native
shutdown before Android terminated the process.

The next causal comparison keeps that same abrupt matrix and every data/key
assertion. A second matrix uses separate owned UUID roots and first invokes
`GeckoSession.close()` and `GeckoRuntime.shutdown()`. It must observe the actual
`GeckoRuntime.Delegate.onShutdown` callback, delivered from the pinned engine's
`Gecko:Exited` event, before the same force-stop/process-absence check. There is
no fixed flush sleep, artificial state replay, import or key regeneration. All
nine original reports run in each mode, including clear-A/keep-B and clear-B.
The combined job remains failed unless both modes pass; a normal-close success
cannot conceal the abrupt-stop counterexample. Neither matrix proves WebView
migration or changes any product environment.

The actual comparison [41869878855](https://github.com/lilyco-42/lyco-browser/actions/runs/41869878855)
repeated the same three abrupt-stop failures. Its normal-close variant reached
only the initial empty-A report: Android recorded the parent process exiting
cleanly with code 0, but the actual shutdown callback did not arrive. No normal
reopen or normal-close persistence result exists for that run. The complete
98130313-byte original ZIP (SHA-256
`7a4e0dbff805ddb8eb94642f3be8c0973ee9659a2c55d7518ed70892cda88264`)
was checked for full size, SHA and CRC; its raw matrix remains failed.

Pinned upstream opt builds default `toolkit.shutdown.fastShutdownStage` to 1,
which may call `_exit(0)` before `GeckoThread` returns from `nativeRun` and
dispatches `Gecko:Exited`. The [upstream shutdown documentation](https://firefox-source-docs.mozilla.org/ipc/proc_shutdown.html#fast-shutdown)
describes stage 0 as full shutdown. This is a causal hypothesis consistent with
the observed exit, not proof of the sole cause or of data durability.
The next comparison requests stage 0 only for the two normal-close UUIDs. Native
startup validates an explicit mode against its owned UUID pair; abrupt UUIDs
retain the original default. Source receipts and native logs identify the
requested preference, without claiming runtime preference readback. The same
optimized compiled AAR, non-debuggable APK, twenty-second actual callback budget,
all nine phases per mode, strict data/key assertions and original abrupt-stop
gate remain required. No product preference or data migration changes.

The completed stage-0 comparison [41873067393](https://github.com/lilyco-42/lyco-browser/actions/runs/41873067393)
passed all nine normal-close phases, with nine actual native callback UI/log
receipts and twelve full-process-absence records. Raw Cookie/localStorage/IDB,
original non-exportable key use, export rejection, same-ciphertext decryption and
clear-A/keep-B/clear-B observations passed. The original abrupt group completed
all nine phases and still failed the same three reopen checks, so the combined
job correctly failed. The full original 98253580-byte archive (SHA-256
`236dbf15612f19a9c8989daf84a515ed96e137901bc86af7bc9c423f763a7389`),
its CRC, full log and all thirteen APK libraries against the same optimized AAR
were independently checked. Source receipts match the exact committed files;
pref request logging is still not runtime preference readback. This establishes
normal-close capability for the owned x86 experiment only. It does not solve
abrupt termination, old WebView data/key migration, ARM64 or product integration.
The unchanged passing RTC experiment does not need a repeat for this storage-only
change.

The next independent comparison isolates cookie buffering without repeating the
unchanged successful normal-close and RTC runs. Pinned upstream
[`CookieDBWriteQueue::MaybeScheduleFlush`](https://github.com/mozilla-firefox/firefox/blob/9a2dc53c369c7ae5172018b35988e1d2ffeff402/netwerk/cookie/CookieDBWriteQueue.cpp)
uses `network.cookie.db.flushIntervalMs` as an ordinary one-shot timer delay;
zero schedules the flush without the default 500ms batching delay. It does not
disable writing, make the asynchronous database transaction synchronous, or
prove that disk writes completed. LSNG has a separate hard-coded write timer,
so this preference alone is not expected to establish full abrupt durability.

Dispatch with the same three storage inputs plus
`native_engine_cookie_flush=true`. This runs only `eager-cookie` with owned UUIDs
5555… and 6666…, the same original nine abrupt-stop phases and every original
Cookie/localStorage/IDB/key/route/clear assertion. Native startup requires this
mode to match its own UUID pair and requests only the cookie timer preference;
it does not request normal shutdown or modify localStorage policy. Requested
configuration is logged and source-bound without claiming preference readback.
The original two-mode matrix remains the default; its failure is retained, and
even a future passing cookie-only observation cannot replace its complete data
requirements. No fixed wait, page injection, data replay, key export, legacy or
testing-only storage API is introduced. Product code and the queued ARM64 recipe
remain unchanged. This comparison requires genuine Actions; code alone is not
a persistence result.

That comparison completed in [41875833193](https://github.com/lilyco-42/lyco-browser/actions/runs/41875833193).
All nine original reports and twelve abrupt process-close receipts were
independently checked. Cookie values survived all three original reopens;
localStorage still returned null. IDB, actual original non-exportable key use,
export rejection and same-ciphertext decryption remained valid. All three
combined data checks therefore still failed, and no success gate was removed.
The full 97866424-byte original ZIP (SHA-256
`23b80fa74988c1c8bb739665cd7db9e7e104bea5d7384c4b894f8167f1f20a3e`),
CRC, full logs, source receipts and thirteen actual APK libraries against the
same AAR were verified. This single experiment is not a synchronous disk
guarantee or product adoption. The next [separate source build](../source-storage/README.md)
targets LSNG's database timer with a production preference, preserves its
5000ms default, original snapshots/transactions/storage format and exact base
route patch, and still requires compilation plus complete runtime gates.
