#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
mkdir -p "$RUNNER_TEMP/lyco-mobile-network"
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends coturn
sudo systemctl stop coturn || true
python3 -m venv "$RUNNER_TEMP/lyco-network-peer"
"$RUNNER_TEMP/lyco-network-peer/bin/pip" install aiortc==1.15.0
"$RUNNER_TEMP/lyco-network-peer/bin/pip" freeze > "$RUNNER_TEMP/lyco-mobile-network/peer-dependencies.txt"
dpkg-query -W coturn > "$RUNNER_TEMP/lyco-mobile-network/coturn-version.txt"
echo "LYCO_NETWORK_PYTHON=$RUNNER_TEMP/lyco-network-peer/bin/python" >> "$GITHUB_ENV"
