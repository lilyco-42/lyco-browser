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
release_flags=(--prerelease)
release_notes='Internal test builds. React Native + desktop cross-platform prototypes. Android debug APK; iOS simulator only. Not production-certified, not audited for fingerprint or billing end-to-end.'
if [[ "${LYCO_DESKTOP_PUBLIC_RELEASE:-}" == 'false' ]]; then
  release_flags+=(--draft)
  release_notes='Owner-only desktop build. Public distribution is held while bundled system-font redistribution rights are reviewed. Functional CI evidence does not constitute commercial distribution approval.'
fi
if ! gh release view "$tag" -R "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  gh release create "$tag" -R "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" "${release_flags[@]}" \
    --title "LYCO Browser CI ${GITHUB_SHA:0:12}" \
    --notes "$release_notes" \
    || gh release view "$tag" -R "$GITHUB_REPOSITORY" >/dev/null
fi
# Apply the hold to an existing tag as well, before uploading any new assets.
# Parallel platform jobs must never turn a draft into a public release.
if [[ "${LYCO_DESKTOP_PUBLIC_RELEASE:-}" == 'false' ]]; then
  gh release edit "$tag" -R "$GITHUB_REPOSITORY" --draft --notes "$release_notes"
fi
for file in "$@"; do
  if [[ ! -s "$file" ]]; then echo "Missing/empty build: $file" >&2; exit 1; fi
  echo "Uploading $(basename "$file") to $tag"
  gh release upload "$tag" "$file" -R "$GITHUB_REPOSITORY" --clobber
done
if [[ "${LYCO_DESKTOP_PUBLIC_RELEASE:-}" == 'false' ]]; then
  echo "Desktop build retained in an owner-only draft; public distribution is not approved."
else
  echo "CI release: https://github.com/$GITHUB_REPOSITORY/releases/tag/$tag"
fi
