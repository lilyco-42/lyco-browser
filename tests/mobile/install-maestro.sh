#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Actions only' >&2; exit 2; }
archive="$RUNNER_TEMP/maestro-cli-2.11.0.zip"
curl --fail --location --retry 4 'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip' --output "$archive"
python3 - "$archive" "$RUNNER_TEMP/maestro-cli" <<'PY'
import hashlib,sys,zipfile
from pathlib import Path
archive=Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a','Maestro checksum mismatch'
with zipfile.ZipFile(archive) as z: z.extractall(sys.argv[2])
PY
chmod +x "$RUNNER_TEMP/maestro-cli/maestro/bin/maestro"
echo "$RUNNER_TEMP/maestro-cli/maestro/bin" >> "$GITHUB_PATH"
