# 2026-10-30 proxy latency and download repair

## Superseding observation: 2026-11-03 00:17 UTC

Subsequent independent maintenance superseded the October 30 fingerprints and
default-gateway assumptions below. Read current state before any change; no old
deployment or rollback plan is reusable. This is a passive SSH observation, not
a fresh performance acceptance.

The five primary services are active/enabled with NRestarts=0. Australian SSH
remains active, Philippine SSH remains disabled backup, and the temporary
au-interactive unit is absent. DNS and panel TCP still use ssh-fast, but gateway
preference is **enabled=false**. The old proof cannot establish that every
current subscription uses the Australian route.

Observed SHA-256 values:

- Route: `16fae36b60c3701b5ffe909ce9b171762c6bf7808f2a3a034e4500673a2a8235`
- Preference: `8273e6a88a751fa518ae6bd054be5f42e1ddcce5eb06bd472998cd587467c339`
- Application: `bf5df5bfd2d46f67b83d06ff8d222a4eb630a0e2d64f972826f09f6ddf10fd4d`

These match November 2. AU SSH has zero warnings in the preceding hour. Existing
reports show 17/27 official health approvals, 16/17 throughput entries with
2,000,000-byte samples, ordinary quality 14/15, a 32-entry deep pool and a
632-entry full public cache from nine source products. Cache counts changed
from the previous source snapshot; these are different scopes, not proof that
every catalogue node works or that a client SSH speed gate passed. The complete
manual catalogue policy is retained. No route, service or customer credential
was changed for this observation.

Last optimization experiment 41014136927 did not pass performance gates and was
not adopted. Earlier HK relay, QoS and separate AU-flow experiments also ended
without a retained optimization. Expired Actions authorization and seven
hash-matched helpers were removed November 2; production AU/PH keys and services
remain. There is no active proxy experiment. New runtime validation requires
new active-path fault evidence, no conflicting Actions run, fresh scoped
authorization and cleanup. Execution remains genuine Actions with SSH-only
server management.

The remaining sections are historical, including that day's then-current
state. They are not present-day routing instructions.

## Current state after 10:03 CST recovery

The earlier Korean interactive/DNS path stopped responding. [40988152219](https://github.com/lilyco-42/lyco-browser/actions/runs/40988152219) confirmed all current member requests timed out although services remained active. Philippine-only HTTPS DNS restored pages but failed the unchanged download minimum, so it was not deployed. The retained Australian SSH route with independent HTTPS DNS passed [40989140434](https://github.com/lilyco-42/lyco-browser/actions/runs/40989140434).

[40989396868](https://github.com/lilyco-42/lyco-browser/actions/runs/40989396868) then restored service: **Australian SSH is active/enabled; Philippine SSH is inactive/disabled as backup.** Both member TCP and HTTPS DNS now use SSH. Only the seven-domain Korean override was removed and the HTTPS DNS detour changed; original nodes, inbound credentials, protocols, UDP fallback configuration and all ordinary-node functions remain. Preserved UDP configuration is not evidence that the failed Korean UDP path is healthy.

Post-deployment samples: pages 2214/1663 ms, exact 4 MiB downloads 1157/2270 KiB/s, GitHub 976.5 KiB/s. The original 900 KiB/s minimum, site checks, four actual-generator owned fixtures and four plan checks passed. Availability recovered; earlier 0.3-second interactive performance has not recovered. All original artifacts were fully verified.

Current configuration SHA-256: `3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206`. Preference proof: `575e703135f0c927fda963b69e631ca1d03573886556b3dec1ea13603952747f`. Recovery source: `fba1e46fedac91da9edcf6b5211fb68bda955a58`. Private backup: `/root/website-backups/proxy-dns-recovery-20261030-020318`. **That backup contains the failed split configuration; do not blindly restore it.** Hourly monitoring instructions were updated to the new primary/backup roles. Temporary probe access and three helpers were revoked after validation.

The remainder records the earlier 08:28 deployment and its validation history; its primary-service and rollback assumptions are superseded by this section.

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
