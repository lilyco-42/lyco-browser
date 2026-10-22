# Network and environment acceptance

Net.Coffee's [Claude](https://ip.net.coffee/claude/),
[GPT](https://ip.net.coffee/gpt/), [DNS](https://ip.net.coffee/dns/) and
[WebRTC](https://ip.net.coffee/webrtc/) pages are requested external checks.
They have not yet been verified on the current LYCO candidate's public egress.
An old screenshot, a stock browser or the GitHub runner's own IP is not product
acceptance. These third-party scores are not OpenAI or Anthropic verdicts.

| Surface | Required evidence | What cannot count as a pass |
| --- | --- | --- |
| Browser settings | Actual profile's first-script UA/platform, language and request header, Date/Intl timezone | Changing the whole host's settings or editing a detector's result |
| HTTPS egress | Actual LYCO profile/proxy route and timestamp, service-specific exit when available | A different browser or server-side request taking another route |
| DNS | Resolver observations and test availability, separately recorded | No observations treated as proof of safe DNS routing |
| WebRTC | Actual peer connection, IPv4/IPv6 candidates and UDP route or confirmed blocking | A timeout or unsupported API treated as successful egress matching |

An IP-mode locale fix handles a specific missing-data case: when exit lookup
discovers a country but has no exact timezone, an unconfirmed saved UTC default
must not override that country's fallback. A known same-country regional
timezone, a valid exact lookup result and an explicit custom choice are retained.
The controlled Korea fixture checks the ordinary proxy-check/launch path,
`ko-KR` request and Navigator language, `Asia/Seoul` in the first script, and
unchanged saved native identity. It is labeled synthetic and cannot certify a
real Korean proxy, Net.Coffee score, DNS or external STUN behavior.

The existing native isolation suite keeps its external-network deny policy.
Public-site checks need a separate, controlled public-egress scenario using the
actual product. Network failures or site blocking must remain inconclusive,
with the original result preserved. No service login, paid model call or score
manipulation is needed for these diagnostics.

## Public CI observation (new, pending execution)

`tests/native-public-network.mjs` uses the actual packaged LYCO application and
its licensed kernel, with a new unowned profile in the disposable runner's
app data on an explicitly **direct GitHub-hosted route**. It requires previous
environments stopped and no subscription account login; it does not reuse a
managed profile, its network permissions or account data. No stock
browser is substituted. This is not the customer's subscription proxy route.

The unchanged Claude/GPT/DNS/WebRTC pages run once, with screenshots, page text,
selected public diagnostic cells, response statuses and actual Navigator/Intl
observations retained. The profile uses the ordinary IP-mode lookup/launch
path; lookup unavailability remains recorded. Browser values must agree with
the engine's selected configuration, while the actual site's observations and
geographic warnings are retained unchanged. Configuration agreement alone is
not an independent geographic oracle and does not certify IP-mode alignment on
a real customer proxy (the separate KR fixture covers its specific regression).

Challenges, HTTP errors, missing results, unexposed DNS, blocked WebRTC and
reported warnings remain separate. A reached page is not a network pass.
`allNetworkChecksPassed` stays unknown pending review of the original results.
Actual selected-language/timezone regressions fail the job; external outages
remain recorded as unavailable. No model login, paid call, score modification,
detector interception or reused user credentials is involved.

## UDA scope

The matching public Rust SDK is
[UniDesktop/SDK](https://github.com/UniDesktop/SDK/tree/a74bd2cf372efad2407d6be4b57739e682cf1d9a).
Its desktop interfaces cover appearance, tray, notifications and similar OS
features. Its appearance interface reads theme/accent/capabilities; it does not
implement browser automation, IP reputation, DNS, WebRTC or per-profile locale.
The read-only Windows appearance bridge is implemented; its Actions acceptance
is pending (see [desktop integration](DESKTOP-UDA.md)). It does not claim to pass
these network checks. Browser settings must remain scoped to the selected profile so that
concurrent profiles do not change each other's locale or the user's OS.
