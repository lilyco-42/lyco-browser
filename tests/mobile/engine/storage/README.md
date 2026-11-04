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
