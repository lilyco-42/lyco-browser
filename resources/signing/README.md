# Android release identity

`android-release-certificate.pem` is the public certificate for the generated
LYCO Android release key. It contains no private key or password. Its DER
SHA-256 fingerprint is:

`1a5407a3cdea1bef835214d0f97d4e94952c69c10b45c1c7573c8f6691297bae`

Explicit signed-candidate Actions runs must pass `apksigner verify` and match
this certificate. CI preview builds may use their preview identity; their
signature provenance records that they do not match the release identity.
The APK, signer report, public fingerprint and actual source commit are retained
only after the native runtime gates succeed. Key generation or a matching
certificate alone does not establish a successful signed candidate or release.

Keep the private keystore and recovery material outside Git. Preserve this
identity for future Android upgrades; any later key rotation needs its own
documented migration and platform support.
