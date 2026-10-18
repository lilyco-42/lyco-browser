# LYCO Browser — Managed Proxy Privacy Boundary

The managed LYCO profile aims to avoid accidentally exposing the device's
ordinary direct route. It is not an invisibility or anti-fraud bypass feature.

## Protections in this change

- Wayfern profiles capture the engine's complete native fingerprint through
  its page-target API and retain it privately in the environment directory.
  Subsequent launches restore that identity before user-page navigation;
  newly opened page targets receive the same identity. This retains native
  noise rather than layering a fresh native device underneath saved settings.
  A damaged, wrong-profile or rejected identity fails startup instead of
  silently minting a replacement. Stock Chromium/legacy kernels retain their
  existing path, and explicit refresh-on-start remains an explicit option.
  Native payloads are not uploaded in CI evidence, sent to the website or
  printed in logs. This native integration must pass the current runtime gate.
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
- Managed status comes from persisted main-process ownership bindings at
  launch. It survives upstream metadata normalization and cannot be enabled
  or disabled by a renderer-provided `lycoManaged` flag.
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

- The Windows native suite requires two real managed environments to apply
  explicit User-Agent, platform, language, timezone, CPU and memory settings.
  CI-owned pages read these browser properties directly, write separate cookies
  and localStorage, then reopen both environments to verify persistence and
  isolation. A fixed canvas drawing must be repeatable per environment and
  distinct between the two saved seeds. These are scoped runtime contracts;
  they do not establish correctness for every fingerprint surface or website.
- Windows GitHub Actions now contains a real bundled Chromium WebRTC
  negative-control probe: a CI-owned UDP listener first receives a deliberate
  control packet, then tests whether an in-browser ICE STUN attempt sends any
  direct UDP packets or exposes literal IP ICE candidates. Page and report
  must both be delivered through Mihomo. This checks one local STUN path only,
  **not** all public STUN/TURN servers, mDNS, candidate types or OS platforms.
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
