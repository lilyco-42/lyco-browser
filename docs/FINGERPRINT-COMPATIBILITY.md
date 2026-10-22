# Fingerprint compatibility and acceptance scope

This integration pins OpenBrowser5fa3 with licensed Wayfern149. It does not
promise anonymity, undetectability or identical pixel output from different
Canvas APIs.

## Canvas ownership checks

Window documents can create an HTMLCanvasElement. Workers use OffscreenCanvas.
Their observations must be compared with the owning Window's **same API**.
The original concurrent test compared a Worker's primary Offscreen drawing with
the Window's primary HTML drawing. That was not an equivalent ownership oracle.

Actual native controls in Actions39375589245, captured after the unmodified
first-script observations in each existing owned frame, show different native
HTML and Offscreen results in both profiles, including opaque integer rectangles
without fonts. The product's HTML matches its own native control. Its managed
Offscreen noise is stable within each owner and different across owners. Stopping
B does not change A's new Worker results. These are measured limitations and
ownership observations, not a claim that the kernel has full cross-API parity.

Acceptance requires all of the following:

- Native controls exist and match the declared owner and product HTML data.
- Managed Offscreen noise is present relative to the raw native control.
- Window, DedicatedWorker and ServiceWorker agree on the owning Offscreen API,
  including opaque readback, while Window HTML remains stable.
- Both owners remain distinct during concurrent use, and A remains unchanged
  after B stops. Real Worker and report requests use the owner's proxy/language.
- Independent negative controls reject wrong-owner data, missing native control,
  changed opaque data, changed HTML and absent noise.

The old mixed-API comparison is replaced explicitly, not silently treated as a
successful parity check. Actual native and product cross-API parity is retained
in the evidence, and a known limitation is reported whenever either differs.
This correction does not disable noise, change saved identities or claim that
the native compatibility boundary has been fixed.

API availability reference: [HTML Canvas](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element)
and [OffscreenCanvas](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface).
The standard distinguishes the APIs and their exposed realms; it is not evidence
that this particular kernel's perturbation algorithms have pixel parity.

## Other boundaries

The native-font layout policy preserves actual CSS geometry instead
of adding post-layout numeric jitter. It requires a supported native kernel and
a valid saved font inventory; unsupported configurations fail closed. New LYCO
profiles select it explicitly, while existing `noise`/`real` choices are retained.
This changes the geometry protection strategy, not the saved device/noise seed.
The Actions gate now requires a genuinely installed host-font positive control
and negative Canvas/DOM/local-font observations across pages, parser frames and
Workers. Passing a finite control is not a universal font-privacy certification.
The native-font policy and unchanged protection assertions are covered by the
current `65b51ac` [complete Windows workflow](https://github.com/lilyco-42/lyco-browser/actions/runs/39814682404),
with preflight47, portable47, installed46 and six installer checks. Its UDA
appearance integration, new-tab GPU consistency and actual environment-check UI
also passed their respective Windows checks; see the
[fingerprint matrix](FINGERPRINT-TEST-MATRIX.md) and [UDA record](DESKTOP-UDA.md).
This supersedes the older b2a9627 and pre-UDA candidate status.

Net.Coffee live pages are a separate requested network acceptance surface.
Their scores are third-party estimates, not OpenAI/Anthropic eligibility results.
An external page result must identify the actual product/egress tested; a stock
browser or GitHub runner's public IP cannot certify the customer's proxy route.

The Windows native, portable and installed EXE acceptance must pass on the exact
candidate commit. macOS/Linux packaging alone is not native UI acceptance.
Local STUN/ICE and proxy failure fixtures cover only their stated cases, not
every possible DNS, IPv6, UDP, extension or OS route. Saved-session multi-window
and failure recovery are included in the stated Windows matrix; untested kernels
and platforms still require their own verification. No real-payment or account
platform safety certification is implied by these tests.
