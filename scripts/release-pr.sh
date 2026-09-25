#!/bin/sh
# Open the release PR from the branch release-please pushed. Repo policy
# blocks Actions from creating PRs, so the release workflow stops short of
# this step. Merging the PR tags the release and dispatches publish.yml.
set -eu

branch=release-please--branches--main--components--agentkit
repo=${REPO:-jthiruveedula/agentkit}

if [ -n "$(gh pr list --repo "$repo" --head "$branch" --state open --json number --jq '.[].number')" ]; then
  echo "release PR already open for $branch"
  exit 0
fi

git fetch --quiet origin "$branch"
changelog=$(git show "origin/$branch:CHANGELOG.md")
# First "## [x.y.z]" section: from its heading up to the next one.
section=$(printf '%s\n' "$changelog" | awk '/^## \[/{n++} n==1')
version=$(printf '%s\n' "$section" | sed -n '1s/^## \[\([^]]*\)\].*/\1/p')
[ -n "$version" ] || { echo "no version section in CHANGELOG on $branch" >&2; exit 1; }

body=$(printf ':robot: I have created a release *beep* *boop*\n---\n\n\n%s\n---\nThis PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).\n' "$section")

gh pr create --repo "$repo" --base main --head "$branch" \
  --title "chore(main): release $version" --body "$body" --label "autorelease: pending"
