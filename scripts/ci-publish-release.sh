#!/usr/bin/env bash
# Only run in GitHub Actions! Publish successful CI builds to an immutable-commit
# prerelease instead of Actions artifacts (which may hit organization quota).
set -euo pipefail
if [[ -z "${GITHUB_ACTIONS:-}" || -z "${GITHUB_REPOSITORY:-}" || -z "${GITHUB_SHA:-}" ]]; then
  echo 'ci-publish-release.sh can only run in GitHub Actions' >&2
  exit 2
fi
if [[ $# -lt 1 ]]; then echo 'At least one binary path is required' >&2; exit 2; fi
tag="ci-${GITHUB_SHA:0:12}"
if ! gh release view "$tag" -R "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  gh release create "$tag" -R "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --prerelease \
    --title "LYCO Browser CI ${GITHUB_SHA:0:12}" \
    --notes "Internal test builds. React Native + desktop cross-platform prototypes. Android debug APK; iOS simulator only. Not production-certified, not audited for fingerprint or billing end-to-end." \
    || gh release view "$tag" -R "$GITHUB_REPOSITORY" >/dev/null
fi
for file in "$@"; do
  if [[ ! -s "$file" ]]; then echo "Missing/empty build: $file" >&2; exit 1; fi
  echo "Uploading $(basename "$file") to $tag"
  gh release upload "$tag" "$file" -R "$GITHUB_REPOSITORY" --clobber
done
echo "CI release: https://github.com/$GITHUB_REPOSITORY/releases/tag/$tag"
