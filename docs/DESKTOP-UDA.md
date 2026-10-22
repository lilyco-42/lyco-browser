# UniDesktop integration

The user confirmed **UniDesktop/SDK**. This integration reads the Windows host
theme and accent color through its appearance backend; it does not change the
OS, profile language/timezone, proxy, DNS, WebRTC, IP reputation or test scores.

Source is fixed at
[a74bd2cf372efad2407d6be4b57739e682cf1d9a](https://github.com/UniDesktop/SDK/tree/a74bd2cf372efad2407d6be4b57739e682cf1d9a).
Actions builds `native/desktop-probe.rs` as an additional binary in the SDK's
Windows backend package, preserving its committed dependency lock. The helper,
original MIT/Apache license texts and redistribution notice enter the actual
portable ZIP and installed EXE layout. It accepts no arguments and calls only
`detect_theme`, `get_accent_color` and `capabilities`.

The trusted application shell exposes a parameter-free IPC read. Its fixed
executable runs without a shell, with a 3-second timeout, bounded output and a
minimal child environment without account/API credentials. Concurrent requests
coalesce and cache for five seconds. Unknown, unavailable and unsupported
results remain explicit; the normal media-query theme fallback continues.

In the existing appearance menu, **follow system** uses the actual UDA theme.
Explicit light/dark preferences take priority. Startup, window focus, OS color
scheme changes and the desktop panel's refresh action re-read the backend.
Accent color is shown as a swatch, rather than overriding accessible theme
tokens. Non-Windows packages explicitly report unsupported for this bridge.

## Required Actions evidence

- Real Windows registry dark/light and asymmetric RGBA positive controls, with
  the original disposable runner settings restored in `finally`.
- Existing SDK appearance backend tests, unchanged SDK dependency-lock digest.
- Missing helper, timeout, malformed output, inconsistent capabilities,
  credential isolation and concurrent request handling regression tests.
- Actual packaged helper binary digest and license notices in native preflight,
  portable and installed runs. Real UI follow-system behavior, manual override,
  desktop panel screenshot and unchanged fingerprint/profile regression suites.

## Verified Windows preview (2026-10-23)

Product source `65b51acdbf5bb7e8c2273ea219c82b3cb0547463` passed
[Actions39814682404](https://github.com/lilyco-42/lyco-browser/actions/runs/39814682404):
preflight47, portable47, installed46 native checks, plus six installer checks.
Actual tested merge `46d7fde745a1fe6fcaa5054fbd526f5c0952eb45` contains this
source head. PR24 is merged; main merge `3c03a10` has the same content tree.

All three Windows stages report ready, verify the packaged notices, actual
follow-system UI and manual override, and use the same helper SHA-256:
`f66626b48aed877297358e829db3531adb902d40cc082472f5170301621d9ed4`.
The raw JSON and installed screenshot were reviewed; the complete artifact's
official and downloaded SHA-256 match:
`62b9ec9bde59273aad7fa2328f74f63b6702ffbbe121032aec829c11f445d3b5`.

![Actual portable desktop appearance panel](images/uda-desktop-65b51ac.png)

[Image provenance](images/uda-desktop-65b51ac.source.json) identifies the exact
run and original, unedited file. The independent fingerprint suites run in
preflight and portable stages; the installed stage does not repeat all nine
independent scenarios. Read-only appearance acceptance does not certify the
profile's public egress, every OS event timing case, or non-Windows support.
The public Windows preview is linked from the [README](../README.md).

## Historical control diagnosis

The first native control uncovered an asynchronous Windows theme/accent race.
Actions39765928187 recorded the desired `0x7F332211` registry value and exact UDA
RGBA `[17,34,51,127]`, followed by Windows resetting the registry to its original
accent. The phases now separate theme changes from the accent control with one
bounded settling wait. Accent assertions still require identical before/after
values and the exact asymmetric RGBA; there is no retry or guessed success.
