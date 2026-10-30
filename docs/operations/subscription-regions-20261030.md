# Subscription region display

Clash Verge and Karing can switch nodes, but some verified ordinary node names contained only protocol and an opaque number. These clients display the subscription's node name. Region groups elsewhere in the source catalogue did not make those names informative.

The publisher now includes the available region in the visible node name. Ordinary nodes are matched to the original catalogue by protocol, endpoint and credential identity; their region is explicitly a **source label**, not a measured exit-country claim. Conflicting or unavailable source data produces `🌍 地区待确认`. The member relay can show `🇦🇺 澳大利亚中转` only when its evidence-bound current egress metadata matches the routing digest. Entry IP geography is not used to invent exit countries.

Clash JSON and V2Ray/base64 share formats are covered. A deep copy preserves cached originals; group references, defaults, dialer references and rule targets are updated consistently. Display changes do not alter addresses, ports, UUIDs, passwords, TLS, node count, protocol coverage, health qualification or automatic preference order. The original name is retained as `x-lyco-original-name` in Clash nodes so LYCO's saved route IDs remain stable after display changes; duplicate/invalid original identities are rejected.

Users refresh the existing subscription in Clash Verge or Karing to receive the names. Subscription URLs and account tokens remain valid. No installer replacement is needed for the server-side names.

## Validation and deployment

Real Actions [40999805910](https://github.com/lilyco-42/lyco-browser/actions/runs/40999805910), public source `d49ba0c3b018aa71395ec5e538a7e887c8a12891`, backend source `cc089f81ea9af510faba2a66aae17834a9066654`:

- Six region-format tests, twenty workspace route tests, actual pinned Mihomo v1.19.32 parsing of all seven retained protocols, and real selected-route integration passed.
- The exact candidate generator passed four Clash format contracts and three V2Ray/base64 format checks with owned fixtures. Existing relay credentials and fallback ordering were checked.
- Privately transformed the full cached catalogue of 735 rows without dropping nodes or changing connection fields. Twenty HTTPS-verified rows were labelled, twelve had matching source regions; the remainder clearly show an unknown region.
- Guarded SSH deployment changed the app, new display module and the evidence's `egress_country=AU` field. All four plan prices/durations and billing health passed; the proxy routing configuration remained byte-identical.

Raw result ZIP: 914 bytes; size, SHA-256 and CRC verified. Private backup: `/root/website-backups/subscription-regions-20261030-035328`. Temporary SSH authorization and three test helpers were removed. The production display module is retained.

Current routing SHA-256 remains `3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206`. The evidence SHA-256 is now `1f5affd84e273c921488d9dcf77127afb37f4926843e6aaca201d49c49c57759`; the only added evidence field is the display country. Billing app SHA-256: `e8e2d3a8cb6f323b6dfc1805b3a4aedd369456bfb4acab3b793463cb50f7f34b`. Hourly monitoring was updated for this legitimate metadata change. This is a display repair, not proof that every source region or retained node is healthy, nor a five-platform formal release.
