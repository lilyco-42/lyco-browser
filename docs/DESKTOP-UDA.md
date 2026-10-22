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

These checks are **pending for this new integration**, even though the preceding
browser candidate b2a9627 passed Actions39591446063. Do not apply its old green
status to a new UDA candidate.

The first native control uncovered an asynchronous Windows theme/accent race.
Actions39765928187 recorded the desired `0x7F332211` registry value and exact UDA
RGBA `[17,34,51,127]`, followed by Windows resetting the registry to its original
accent. The phases now separate theme changes from the accent control with one
bounded settling wait. Accent assertions still require identical before/after
values and the exact asymmetric RGBA; there is no retry or guessed success.
