# Native saved-session preparation: investigation, not a release acceptance

## Requirement and reproduction

Use the real bundled Wayfern149 with the existing profile engine. Seed two
synthetic pages through the actual local proxy, stop the profile, clear only the
fixture server's observations, then start the same profile in restore mode
without configured URLs. Both pages must report their saved identity in their
first script, preserve storage and native identity bytes, and use the proxy.
No harness injection, navigation, reload, replacement URL or identity reset.

All reproduction and product execution is GitHub Actions only. The existing
`tests/native-session-restore-contract.mjs` exercises these requirements.

## Evidence and excluded hypotheses

- The original launch restore can expose host language, timezone, CPU and memory
  before the owning CDP preparation. Previously passing runs did not exclude the
  observed race.
- Launching without windows and sending another process-singleton restore
  request did not restore the saved pages: a real running, unblocked browser had
  only an internal page (run39294770050). This mechanism was replaced.
- A local per-profile sessions-only extension, its native `onChanged` listener,
  and a trusted temporary blank window let the real sessions service restore
  the original two URLs. No URL reconstruction is involved.
- Run39374200135 establishes that the first failure is `Runtime.enable` before
  document-script registration. The earlier `runImmediately` deadlock diagnosis
  was a hypothesis, not an observed root cause.
- Explicit target activation succeeded but did not fix preparation
  (run39375359017). Activation was removed.
- Fixed, nonsecret error classes in run39376327130 establish an 8000ms timeout
  on each restored page's first `Runtime.enable`. Later closed-connection errors
  do not prove those later methods independently time out.
- Run39377419558 tried Page before the font Runtime bridge, but after the native
  setter. Both restored `Page.enable` calls timed out at 8000ms.
- Run39378592852 moved Page/Runtime initialization before the native setter.
  Both restored pages still timed out on `Page.enable`; the setter was never
  called for them. The trusted blank page acknowledged the same domains in
  1–2ms. Native identity assignment is therefore not necessary to reproduce the
  stalled Page command in this integration.

Raw39378592852 ZIP SHA256 is
`0fe8af7bebfe86e915cb2f3a79d6c81bc593bceb7195b8783d3cee4cc7b35be8`;
official asset digest and local hash matched. Evidence remains under the private
task evidence directory, with no seeds or opaque native payloads in this report.

## Current causal control

Candidate8ef2493 prepared the paused parent before enabling nested related-target
auto-attach. Actions39401475960 failed with restored `Page.enable` timeouts before
native assignment and related-target setup. This disproved that ordering as a
solution. It and the extra pre-native Page/Runtime initialization have been
removed; the original relative ordering is restored in the next candidate.

Regression coverage being prepared also creates same-origin and different-site
iframes in the HTML parser before the parent's first script. Their own first
scripts must report the expected identity and both document and report requests
must use the actual proxy. This checks that changing related-target ordering
does not expose a child document before protection is ready. These additions
are unverified until their exact commit runs in Actions.

An additional concrete readiness gap exists in `openSavedSession`: allocating
the trusted blank target was immediately followed by the native restore call,
without waiting for that target's preparation. Prior traces show restored pages
already attached while the blank target was still preparing. The next candidate
waits for the exact bootstrap target's script/Fetch preparation AND successful
debugger-resume receipt. Destroyed or detached targets are removed from readiness
sets. Focused tests require no restore call while this readiness is pending, one
call after readiness, and cleanup with zero calls if readiness never arrives.
Actual native acceptance is still required to establish whether this resolves
the stalled restored renderers.

Run39402864676 passed the cheap readiness tests but failed the new cross-site
frame assertion before reaching session restoration. Its captured cross-site
UA, language, CPU, timezone, frame host and proxy path match expectations, but
`deviceMemory` is absent on ordinary HTTP. That absence is required by its
`[SecureContext]` API definition, whereas loopback HTTP is trustworthy and exposes
the configured value. The test originally assumed equal API availability across
these contexts. Corrected coverage records and asserts `isSecureContext` and
property presence, retaining the configured memory assertion for the secure
frame and requiring absence in the insecure frame. Product behavior is not
changed. This failed run does not establish whether the readiness fix works.

References: https://www.w3.org/TR/device-memory/#webidl-interface and
https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy.

Run39403795843 confirms same-origin and cross-site parser-frame identity and
proxy checks on both initial start and reopen. Bootstrap preparation/resume now
finishes before the restore call, but the two actual restored pages still time
out on their first `Runtime.enable` (8000ms). The readiness gap is corrected,
but is not the sole cause of the restored-renderer stall.

The next candidate uses browser -> tab -> page attachment. Root page/iframe
exclusion prevents duplicate preparation through root and tab sessions. Paused
tab preparation and actual parent debugger-resume acknowledgement are separate
promises: a child is not reported ready until both complete. Failure, close,
detach or missing resume acknowledgement refuse that parent's children. First
script, native identity and script-registration checks remain unchanged.

An independent report on the same149 kernel describes premature direct-page
attachment and a working tab-level attachment hierarchy:
https://github.com/sheying2013/OpenBrowser/issues/36 . It is supporting evidence,
not proof that this candidate passes. The maintainer's timeout/resume-first
workaround is deliberately not adopted because it would weaken the first-script
preparation contract. Actual Actions acceptance decides this candidate.

## Scope and residual risk

Actions39405949786 passed the tab-hierarchy restoration fix in all three real
Windows stages. It is not evidence that the same attachment strategy is safe
for every ordinary new-tab path: combined Actions39410773730 passed preflight,
then its portable package exposed host4CPU/8GB in a new page and same-site
parser frame before later reading the configured6CPU/4GB. Language, timezone,
native Canvas and proxy were already correct; a parent Tab pause alone did not
hold all document script execution until the full JS setup completed.

The next candidate limits the restoration hierarchy to restore launches and
retains the original direct Page pause for ordinary launches. The actual
new-target test now repeats three times both before and after reopening, with
same/cross-site parser frames and unchanged first-script assertions each time.
This candidate remains unverified until its own full Actions acceptance.

Do not extend timeouts, resume before preparation, weaken first-script checks,
reset saved identity, or turn a failing run into a release. Full multi-window
preservation and failure recovery are separate unverified requirements.

The independent Canvas control is recorded in PR24: native HTML and native
Offscreen results differ even without default-world JS hooks. That is a separate
compatibility boundary and must not be mislabeled as proof of account mixing.
