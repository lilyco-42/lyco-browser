#!/usr/bin/env bash
set -euo pipefail
input=/dev/null
if [ "$LYCO_PROBE_PHASE" = subscription-catalogue ]; then
  input="$RUNNER_TEMP/region-core/mihomo-linux-amd64-v1.19.32.gz"
  test -f "$input"
fi
for attempt in $(seq 1 "${LYCO_SSH_MAX_ATTEMPTS:-60}"); do
  if "${LYCO_SSH_BIN:-ssh}" -i "$RUNNER_TEMP/probe-key" -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$RUNNER_TEMP/probe-hosts" "$PROBE_USER@$PROBE_HOST" "$LYCO_PROBE_PHASE" < "$input" > "$RUNNER_TEMP/proxy-speed-result.json" 2> "$RUNNER_TEMP/proxy-speed-ssh.log"; then
    cat "$RUNNER_TEMP/proxy-speed-result.json"
    exit 0
  else
    status=$?
  fi
  if [ "$status" -ne 255 ] || [ -s "$RUNNER_TEMP/proxy-speed-result.json" ] || ! grep -Eq 'Permission denied|connect to host .*Connection refused|connect to host .*Connection timed out' "$RUNNER_TEMP/proxy-speed-ssh.log"; then
    cat "$RUNNER_TEMP/proxy-speed-result.json"
    cat "$RUNNER_TEMP/proxy-speed-ssh.log" >&2
    exit "$status"
  fi
  sleep "${LYCO_SSH_RETRY_DELAY:-4}"
done
cat "$RUNNER_TEMP/proxy-speed-ssh.log" >&2
exit 1
