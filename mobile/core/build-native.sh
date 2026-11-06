#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Native core builds run in Actions only' >&2; exit 2; }
platform=${1:?android or apple}
go mod tidy
go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.12
go install github.com/sagernet/gomobile/cmd/gobind@v0.1.12
capture_args=()
if [[ ${LYCO_CAPTURE_GENERATED_SOURCES:-false} == true ]]; then
  [[ "$platform" == android ]] || { echo 'Generated source capture is Android-only until Apple is verified' >&2; exit 2; }
  export LYCO_REAL_GO=$(command -v go)
  export LYCO_CAPTURE_ROOT="$RUNNER_TEMP/lyco-binding-capture-android"
  test ! -e "$LYCO_CAPTURE_ROOT"
  mkdir -p "$LYCO_CAPTURE_ROOT/tools" "$LYCO_CAPTURE_ROOT/work/bind" "$LYCO_CAPTURE_ROOT/work/go"
  cp capture-go-build.py "$LYCO_CAPTURE_ROOT/tools/go"
  chmod 755 "$LYCO_CAPTURE_ROOT/tools/go"
  export TMPDIR="$LYCO_CAPTURE_ROOT/work/bind"
  export GOTMPDIR="$LYCO_CAPTURE_ROOT/work/go"
  export PATH="$LYCO_CAPTURE_ROOT/tools:$PATH"
  capture_args=(-work)
fi
if [[ "$platform" == android ]]; then
  export ANDROID_NDK_HOME=$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
  test -n "$ANDROID_NDK_HOME"
  gomobile bind -v "${capture_args[@]}" -target=android/arm64,android/amd64 -androidapi=28 -javapkg=top.lain42 -tags=with_quic,with_utls -trimpath -o "$RUNNER_TEMP/lyco-tunnel.aar" .
  python3 - <<'PY'
import os,zipfile
from pathlib import Path
archive=Path(os.environ['RUNNER_TEMP'])/'lyco-tunnel.aar'
with zipfile.ZipFile(archive) as z:
    names=z.namelist()
    assert 'classes.jar' in names
    assert any(x.startswith('jni/arm64-v8a/') and x.endswith('.so') for x in names)
    assert any(x.startswith('jni/x86_64/') and x.endswith('.so') for x in names)
    z.extract('classes.jar',Path(os.environ['RUNNER_TEMP'])/'lyco-tunnel-binding')
PY
  javap -classpath "$RUNNER_TEMP/lyco-tunnel-binding/classes.jar" top.lain42.lycotunnel.Lycotunnel top.lain42.lycotunnel.Session > "$RUNNER_TEMP/lyco-tunnel-bindings.txt"
  if [[ ${LYCO_CAPTURE_GENERATED_SOURCES:-false} == true ]]; then python3 retain-generated.py; fi
else
  gomobile bind -v -target=ios,iossimulator -iosversion=17.0 -tags=with_quic,with_utls,with_low_memory -trimpath -o "$RUNNER_TEMP/Lycotunnel.xcframework" .
  find "$RUNNER_TEMP/Lycotunnel.xcframework" -name '*.h' -exec cat {} \; > "$RUNNER_TEMP/lyco-tunnel-bindings.txt"
  cd "$RUNNER_TEMP"
  tar czf lyco-tunnel-apple.tar.gz Lycotunnel.xcframework
fi
