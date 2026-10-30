# 2026-10-30 proxy latency and download repair

The member gateway previously sent TCP traffic through the Australian SSH egress. Pages took about 1.3 seconds to respond and first-download throughput varied. The deployed configuration now sends seven interactive domain suffixes through the existing, strictly verified Korean TUIC outbound, and retains the existing TCP routing structure with Philippine SSH as its local SOCKS egress:

- `google.com`, `gstatic.com`, `chatgpt.com`, `openai.com`
- `oaistatic.com`, `oaiusercontent.com`, `cp.cloudflare.com`

Only one domain rule was inserted before the existing member TCP catch-all. Customer inbound accounts, protocol settings, DNS, node identities, ordinary-node catalogue, subscription formats, billing and prices were retained. This is domain routing; it does not inspect encrypted HTTPS paths or file sizes.

The new `lyco-ph-ssh-egress.service` owns the existing loopback SOCKS port. The original Australian unit was stopped and disabled to avoid a port conflict; its unit, key and host pins are retained for rollback. Production SSH authentication permits forwarding only from the gateway's fixed source address, has no shell access, and uses strict host-key checks. Private keys remain on the gateway. The subscription preference proof is bound to the deployed routing digest.

## Actual validation

All product/network execution occurred in genuine GitHub Actions over narrowly scoped SSH; no customer token was used. JSON/ZIP/hash inspection and staging did not run product tests locally.

| Run | Scope | Pages | Two complete 4 MiB downloads | GitHub 4 MiB range |
| --- | --- | --- | --- | --- |
| [40979188672](https://github.com/lilyco-42/lyco-browser/actions/runs/40979188672) | First complete target configuration | 311 / 283 ms | 1311 / 1739 KiB/s | 1268 KiB/s |
| [40979591445](https://github.com/lilyco-42/lyco-browser/actions/runs/40979591445) | Independent complete target repeat | 306 / 281 ms | 2997 / 2785 KiB/s | 1409 KiB/s |
| [40979867529](https://github.com/lilyco-42/lyco-browser/actions/runs/40979867529) | Guarded deployment and post-deployment checks | 316 / 296 ms | 1511 / 2479 KiB/s | 1331 KiB/s |
| [40980168876](https://github.com/lilyco-42/lyco-browser/actions/runs/40980168876) | Independent observation after deployment, two samples of current routing | 313–408 ms | 1380–2798 KiB/s | 796–1033 KiB/s |

The original deployment minimum of 900 KiB/s for each of three exact 4 MiB files was retained for both target observations and post-deployment validation. Bare Philippine SSH with its remote-default DNS was a separate control: one GitHub sample was 313 KiB/s. It was not the target configuration; the target retains the existing Korean HTTPS DNS. All control results were preserved. Later observation shows real variability and is not a continuous throughput guarantee.

Deployment also verified the actual subscription generator against four owned fixtures, preserved relay credentials and fallback choices, and checked all four plan prices/durations. The live service returned YouTube 204 and anonymous OpenAI API 401. These establish reachability, not video playback or account login. Original artifacts were verified by byte length, SHA-256 and ZIP CRC.

Deployment source: `f29fc226398889e88097db5aaa2433de46c5a8b2`. Observation source: `650f0591e603afe7ccb9fe9dc4442a4df0e358c7`. Deployment private backup: `/root/website-backups/proxy-ph-egress-20261030-002828`.

## Operation and rollback

Read service state through the existing SSH alias. The Australian service being inactive is expected while the Philippine service owns the shared port. A separate hourly thread heartbeat checks existing state quietly and only reports actionable changes. The old `proxy-throughput.json` measures direct protocol nodes; it is not a measurement of the new SSH member route.

The private backup contains the previous full configuration, preference proof and Australian unit. Do not export these files. A rollback must restore both configuration and its matching preference proof, stop/disable the Philippine unit, start/enable the original Australian unit, and restart sing-box. Keep the old Australian key and host pins intact. Validate any rollback through genuine Actions with fresh, narrowly scoped authorization.

Completed deployment plans are consumed. Temporary main/HK/KR/PH probe authorizations, identities and hash-matched helper files were revoked after the final observation; the restricted production Philippine authorization is retained. Do not replay consumed plans, rerun legacy deployment phases, reuse stale authorization or interpret source/host verification failures as a reason to disable checks. Fresh probes must stage the reviewed source and authorize a fresh runner-only identity.

The PR remains a draft. This operational repair does not satisfy the outstanding five-platform native isolation, traffic, signing or release gates.
