# Android VPN routing versus native RTC address observation

The requirement remains selected-route browser/RTC traffic without direct
fallback, raw address concealment and preserved old per-UUID data/keys. This is
an isolated diagnostic, not a replacement for the ongoing Gecko source/storage
work or any original product acceptance gate.

Research before implementation found two existing candidates:

- [SFA](https://github.com/SagerNet/sing-box-for-android/tree/a548a7903e96266a0046018562c73b192edbfc18),
  1393 stars observed 2026-11-05: existing per-app TUN and protected core sockets.
  Its LICENSE is GPLv3-or-later plus a name/association-consent clause; GitHub's
  `NOASSERTION` classification does not mean no license. No SFA code is copied.
- [NetGuard](https://github.com/M66B/NetGuard/tree/166df969c3cedd7023c13613d9816c185702c6c9),
  3964 stars observed 2026-11-05, GPL-3.0 metadata: existing userspace per-app
  firewall, not proof of native browser candidate concealment or LYCO routing.

[Android's API](https://developer.android.com/reference/android/net/VpnService)
documents system consent, one active VPN and interface deactivation before
`onRevoke`. Its [builder](https://developer.android.com/reference/android/net/VpnService.Builder)
controls packages rather than LYCO UUIDs. Trusted core outbound sockets would
need explicit protection, including the UDP transports used by existing nodes.
[RFC 8828](https://datatracker.ietf.org/doc/html/rfc8828) distinguishes normal
routing from address-concealment and forced-proxy modes: determining a local
address can occur without sending packets. A
[forum report](https://www.reddit.com/r/androiddev/comments/1sgkx3e/vpnservice_tun_interface_stops_receiving_packets/)
was a lifecycle troubleshooting lead only, not evidence about our product.

Decision: do not adopt a VPN or assume old-key migration is solved. A small
SDK-only diagnostic can answer the missing routing/address question without
importing a complete client/UI/core. It uses public Android APIs and contains
no target proxy implementation. New preparation, syntax, Java compilation and
runtime execute only on genuine GitHub Actions.

`probe-android-vpn-boundary.yml` checks syntax on PRs. A manual run builds a
separate non-debuggable API35/x86_64 app, target36/min28, with a disposable
signature. It requests actual system VPN consent through the owned emulator UI.
The per-app VPN includes only that app and captures/discards packets; it never
forwards upstream or modifies the product, another app or an existing profile.

The same native WebView observes top, initial empty and nested empty frames
before/during/after the VPN. Ordinary page code invokes actual native RTC and
retains original candidate events, SDP and local stats without a page bridge or
policy wrapper. Independent owned STUN endpoints record actual received
packets and respond with their real observed endpoint plus a valid fingerprint.
Before/after positives, actual VPN network/descriptor state and the system
consent UI are required. Captured STUN port counts and unmasked numeric/physical
addresses are reported separately. On exit, the own app is stopped/uninstalled,
the owned fixture stops and disposable signing material is removed.

`experimentCompleted` means measurements completed. It is never the original
nine-context privacy acceptance or a VPN fix. The result explicitly leaves
selected upstream/TURN functionality, IPv6 packet behavior, permission-revocation
fail-closed behavior, old data/key migration, product adoption and release
unproven. Even a clean result here requires the unchanged full functional and
negative controls on an actual integrated product.

## Actual bounded measurement

[41951459953](https://github.com/lilyco-42/lyco-browser/actions/runs/41951459953)
completed on source `40891fe172116c6cd3b39ad524e9fb4a828b86b7` using API35
WebView Chrome/124.0.6367.219. The complete original 156961-byte archive has
SHA-256 `b3a3fd06511c68dd498ed55188bd37ce87da5b83d79057bfe8d2c55f7988f620`;
size/SHA/CRC, all eight source-file hashes, actual probe APK and raw observations
were independently checked. The
[unmodified result](../../../docs/audits/android-vpn-boundary-41951459953.json),
[original events/SDP/stats and STUN observations](../../../docs/audits/android-vpn-boundary-41951459953.network.json)
and [source verification](../../../docs/audits/android-vpn-boundary-41951459953.source.json)
are retained.

Each of the three contexts sent six STUN requests into the actual TUN; the
owned receiver saw zero during VPN. Before and after VPN each context produced
a real STUN response and corresponding native server-reflexive candidate.
Actual consent UI and active/descriptor/network states were observed, followed
by verified descriptor closure and restored after-controls. The disposable app
was uninstalled and signing material removed.

During the bounded eight-second gathering window, original events/SDP/stats
still expose configured TUN addresses `192.0.2.2` and `2001:db8::2`; none matched
the emulator's observed physical interface addresses. These virtual addresses
must not be described as physical-IP leaks. They do fail the unchanged numeric
host-address criterion. Gathering reached the deadline, not completion, during
capture/discard. This proves neither future absence of leaks nor selected
proxy/TURN functionality. Measurement success is not privacy acceptance, product
adoption, migration or release. The Gecko storage and ARM64 paths remain open.

Earlier terminal attempts are retained: `41950656045` failed Java lambda
compilation before runtime, and `41950959525` failed the original after-stop
state check because `stopService` did not close the system-bound VPN descriptor.
The explicit stop action now closes that descriptor before waiting for the
same unchanged network-state and after-positive checks.
