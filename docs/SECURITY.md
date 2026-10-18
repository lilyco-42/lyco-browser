# LYCO Browser — Managed Proxy Privacy Boundary

The managed LYCO profile aims to avoid accidentally exposing the device's
ordinary direct route. It is not an invisibility or anti-fraud bypass feature.

## Protections in this change

- A paid, managed profile requires current entitlement and a live loopback
  Mihomo proxy before a browser window can launch.
- Imported subscriptions cannot make a managed profile use built-in DIRECT,
  PASS, or COMPATIBLE exits. Every group uses REJECT on an empty fallback.
  Unknown routes or provider-expanded groups are rejected rather than
  silently falling back to the device network.
- Managed Chromium profiles remove the upstream localhost/127.0.0.1 proxy
  bypass list and keep Chromium's special negative-loopback rule, which
  disables the implicit Chromium loopback bypass. Unmanaged profiles keep
  existing settings.
- Real packaged Chromium Actions acceptance checks whether a runner-reachable
  loopback HTTP fixture gets contacted **through Mihomo** (not directly).
- All managed HTTP traffic uses the PROXY policy, including lain42.top.
  The trusted Electron main process still authenticates to LYCO's Billing API
  independently using HTTPS; that API request is not browser profile traffic.
- The local proxy listens on 127.0.0.1 only, without the remote controller or
  LAN access. When its core unexpectedly exits, owned browser windows are
  asked to stop. Unmanaged environments retain their existing behavior.
- Authentication secrets stay out of the renderer API. No real payment is
  attempted by this change.

## Honest limitations / next gate

- A local HTTP proxy does not cover all device traffic. Browser WebRTC,
  DNS, IPv6, UDP, extensions, OS networking and local services require
  runner-based leak tests for each browser kernel/platform. No claim of
  complete anonymity or undetectability is made.
- Only GitHub Actions may compile, launch, or test this browser, per owner
  requirement. Do not run npm, the browser, or Mihomo on the owner's PC.
- If a subscription depends on dynamic providers or uses only a direct
  fallback, the managed profile refuses to connect. Prefer a verified,
  explicit proxy node over permissive fallbacks.
- A release remains a prerelease until tests of the packaged binaries,
  leak checks and commercial redistribution terms are accepted.

## Comparison scope

Public competitor feature descriptions mention per-profile proxies, separated
storage, privacy controls and team management; none prove universal isolation.
LYCO must evaluate each protection with a negative test, not a marketing claim.

References:
- https://wiki.metacubex.one/en/config/proxy-groups/
- https://wiki.metacubex.one/en/config/proxies/built-in/
- https://www.rfc-editor.org/rfc/rfc8828.html
- https://www.w3.org/TR/fingerprinting-guidance/