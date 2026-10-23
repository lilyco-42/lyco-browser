# Network and environment acceptance

Net.Coffee's [Claude](https://ip.net.coffee/claude/),
[GPT](https://ip.net.coffee/gpt/), [DNS](https://ip.net.coffee/dns/) and
[WebRTC](https://ip.net.coffee/webrtc/) pages are external diagnostic checks.
They are not OpenAI or Anthropic verdicts and cannot certify account access.
The current Windows preview has actual product observations on a direct
GitHub-hosted Azure route, described below. That is not the customer's
subscription proxy route. No target-service login or paid model call is used.

Additional Client Hints/WebGPU coverage and unverified local-machine boundaries
are described in [privacy test scope](PRIVACY-TEST-SCOPE.md). A successful test
does not promise complete avoidance of a platform's security checks.

## Current verified observation

Product source `65b51acdbf5bb7e8c2273ea219c82b3cb0547463` passed
[Actions39814682404](https://github.com/lilyco-42/lyco-browser/actions/runs/39814682404).
The tested merge is `46d7fde745a1fe6fcaa5054fbd526f5c0952eb45`; PR24 is
merged and main `3c03a10` has the identical content tree. The full evidence
artifact's official/downloaded SHA-256 is
`62b9ec9bde59273aad7fa2328f74f63b6702ffbbe121032aec829c11f445d3b5`.
Original JSON, page text and screenshots were reviewed before publishing the
[Windows preview](../README.md). Observed at 2026-10-22 17:14:14–17:15:36 UTC.

| Observation | Actual result | Boundary |
| --- | --- | --- |
| Normal manager UI | Four fixed actions opened four real environment tabs | No stock browser or harness navigation substituted |
| HTTP | Four 200 statuses from original browser NavigationTiming | Status source retained; reachability is not a network pass |
| Selected settings | en-US/en, America/New_York; four settings checks agree | Site locale/timezone consistency on this CI route only |
| GPU / identity | Same RTX3060 renderer, Canvas `2FE73970`, WebGL `48C57369` in Claude/GPT | Same public profile; not all profiles must share this GPU |
| Original IP rating | 54 / 良好 | Unchanged third-party score; no official service verdict |
| Standalone DNS | Original button clicked and completed; 19 Azure resolver observations; site reports no detected leak | Not customer-route certification |
| Standalone WebRTC | Original button clicked and completed; disabled/unexposed | No positive UDP egress-match claim |
| Native identity cache | Unchanged | No reminting or detector-result editing |

`allNetworkChecksPassed` remains unknown, rather than treating the green build
or HTTP200 as a universal network pass. DNS observations, blocked WebRTC,
unknown cells, geographic warnings and unavailable tests stay separate.

## What the tests measure

| Surface | Required evidence | What cannot count as a pass |
| --- | --- | --- |
| Browser settings | Actual profile's first-script UA/platform, language/request header, Date/Intl timezone | Changing the host's settings or detector output |
| HTTPS egress | Actual LYCO profile route and timestamp, service-specific exit when available | A different browser or server-side request using another route |
| DNS | Resolver observations and test availability, separately recorded | No observations treated as safe DNS routing |
| WebRTC | Actual peer connection/candidates and UDP route, or confirmed blocking | Timeout or unsupported API treated as successful egress matching |

The workspace's **Environment checks** button lists only running, ready
environments. Its four fixed actions use the existing trusted tab API inside
the selected environment. It never falls back to another profile or the OS
browser. Stopped/changed targets and duplicate in-flight clicks are rejected.
An owner can inspect their own configured route without sharing credentials
with CI. These UI paths are included in the current Windows acceptance.

`tests/native-public-network.mjs` uses the actual packaged application and
licensed kernel with a fresh unowned profile in disposable runner app data,
previous environments stopped, and no subscription account login. The ordinary
IP-mode lookup/launch selects the configuration; lookup unavailability is
retained. The test clicks the real UI, selects the target and invokes each
fixed action, then clicks the original standalone DNS/WebRTC button once.
Screenshots, page text, verdict cells and actual Navigator/Intl readings remain
unmodified. Native-created tab response events can precede observer attachment;
when no response status was captured, the observer reads the page's original
NavigationTiming responseStatus and records its source, or retains unknown.

Controlled native isolation suites separately deny external HTTP. Their
synthetic Korea fixture verifies that a country lookup without an exact
timezone does not let an unconfirmed saved UTC override the country fallback.
Known same-country regional timezones, exact lookups and explicit custom
choices remain intact. The ordinary check/launch path yields ko-KR and
Asia/Seoul at the first script without changing native cache. This synthetic
fixture does not certify an actual Korean proxy, DNS, STUN or reputation.

## Historical blocker and current fix

`aca866b` / Actions39779882161 passed its then-existing suite, but review of
original public screenshots found Intel and AMD renderers across the same
profile's Claude/GPT tabs. That release remained unpublished; its score81 was
not reused as current acceptance. Canvas stability alone had missed the GPU
metadata mismatch.

`307bfee` / Actions39812770802 added strict first-script WebGL1/2 checks and
failed at the first ordinary new tab: startup pages read configured Intel,
while that new tab and its parser frame initially read saved native AMD.
Later main-world reads returned Intel; a read-only isolated world remained AMD.
Cache, CPU and locale stayed unchanged. Verified artifact SHA-256:
`38fb139c0138e933280d490092b1901b5f5345b41a04801907332ba791bd9e5e`.

Current `65b51ac` applies the profile-selected vendor/renderer to the native
page and paused-session identity before page execution, alongside explicit
CPU/locale settings. Saved device files, seeds and opaque GPU parameters stay
unchanged, and real/blocked metadata policies remain intact. The strict
startup/new-tab/frame/restore and isolated-world observations were retained and
passed in preflight and packaged Windows runs. Current public Claude/GPT
screenshots also agree. This result covers the tested matrix, not every future
kernel or detector.

The earlier `6cb8525` / Actions39773041895 reached all four landing pages but did
not click the standalone DNS/WebRTC buttons. Its score74 and landing-page text
are historical observations, not completed standalone tests or current proof.

## UDA scope

The user-confirmed Rust SDK is
[UniDesktop/SDK](https://github.com/UniDesktop/SDK/tree/a74bd2cf372efad2407d6be4b57739e682cf1d9a).
Its read-only Windows appearance bridge is implemented and accepted in all
three current Windows stages; see [desktop integration](DESKTOP-UDA.md).
It reads theme/accent/capabilities. It does not implement browser automation,
IP reputation, DNS, WebRTC or per-profile locale. Browser settings remain
scoped to profiles, independently of the user's OS and concurrent environments.
