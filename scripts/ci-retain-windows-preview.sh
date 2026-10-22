#!/usr/bin/env bash
# Keep a gate-validated owner PR build reviewable without publishing it.
set -euo pipefail
review_repo="${GITHUB_REPOSITORY:-}"
review_head_repo="${PR_HEAD_REPOSITORY:-}"
review_actor="${GITHUB_ACTOR:-}"
review_owner="${GITHUB_REPOSITORY_OWNER:-}"
if [[ "${GITHUB_ACTIONS:-}" != true || "${GITHUB_EVENT_NAME:-}" != pull_request ||
      "${review_repo,,}" != lilyco-42/lyco-browser ||
      "${review_head_repo,,}" != "${review_repo,,}" || "${review_owner,,}" != lilyco-42 ||
      "${review_actor,,}" != "${review_owner,,}" ||
      "${LYCO_NATIVE_GATES_PASSED:-}" != true ||
      ! "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ||
      ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ || ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]; then
  echo 'Only a gate-validated owner PR can retain this private review package.' >&2
  exit 2
fi
if [[ $# != 2 || "${1##*/}" != LYCO-Browser-Windows-x64-MVP.zip ||
      "${2##*/}" != LYCO-Browser-Windows-x64-MVP.exe || ! -s "$1" || ! -s "$2" ]]; then
  echo 'Expected the actual Windows ZIP and EXE.' >&2
  exit 2
fi
tag="review-${GITHUB_SHA:0:12}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
scratch=$(mktemp -d)
manifest="$scratch/SHA256SUMS.txt"
notes="$scratch/notes.md"
trap 'rm -f -- "$manifest" "$notes"; rmdir -- "$scratch"' EXIT
: > "$manifest"
for package_file in "$1" "$2"; do
  # Git Bash can emit "hash *path" while Linux emits "hash  path".
  # Normalize both to the actual download basename, not a runner-only path.
  package_digest=$(sha256sum -- "$package_file")
  package_digest="${package_digest:0:64}"
  if [[ ! "$package_digest" =~ ^[a-f0-9]{64}$ ]]; then
    echo 'Invalid package checksum output.' >&2; exit 2
  fi
  printf '%s  %s\n' "$package_digest" "${package_file##*/}" >> "$manifest"
done
cat > "$notes" <<EOF
Unpublished Windows CI review package.

Tested source: $GITHUB_SHA
Actions: https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID

Native, portable and installed workflow gates passed before retaining these files.
The public-site observer preserves unknown results and third-party warnings;
its completion is not a network certificate or a platform eligibility guarantee.
All binaries and icon assets were built only in GitHub Actions.
EOF
if draft=$(gh release view "$tag" -R "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft 2>/dev/null); then
  if [[ "$draft" != true ]]; then
    echo 'Refusing to add files to an already published release.' >&2; exit 3
  fi
  actual=$(gh api "repos/$GITHUB_REPOSITORY/commits/$tag" --jq .sha)
  if [[ "$actual" != "$GITHUB_SHA" ]]; then
    echo 'Existing review tag points to a different source.' >&2; exit 3
  fi
else
  gh release create "$tag" -R "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --draft \
    --title "Windows CI review ${GITHUB_SHA:0:12} / $GITHUB_RUN_ID" --notes-file "$notes"
fi
# Never replace assets. A retry/second attempt has its own run-attempt tag.
gh release upload "$tag" -R "$GITHUB_REPOSITORY" "$1" "$2" "$manifest"
echo "Retained an unpublished review package: https://github.com/$GITHUB_REPOSITORY/releases/tag/$tag"
