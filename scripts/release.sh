#!/usr/bin/env bash
# Cut a new Petomato release and push it remotely.
#
# Bumps the version in all three manifests (package.json, Cargo.toml,
# tauri.conf.json), commits, tags `vX.Y.Z`, and pushes — which triggers the
# `release` GitHub Actions workflow to build, sign, and publish the GitHub
# Release (with updater artifacts + latest.json the in-app updater reads).
#
# Usage:
#   ./scripts/release.sh 2.1.0
#
# Prereqs: a clean git tree on the branch you want to release from, and the
# repo secrets configured (see RELEASING.md).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: ./scripts/release.sh <version>   e.g. ./scripts/release.sh 2.1.0" >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must be semver X.Y.Z (got '$VERSION')." >&2
  exit 1
fi
TAG="v$VERSION"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — commit or stash first." >&2
  exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists." >&2
  exit 1
fi

echo "==> Bumping version to $VERSION"
# package.json: top-level "version": "..."
node -e 'const f="package.json",p=require("./"+f);p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$VERSION"
# tauri.conf.json: top-level "version": "..."
node -e 'const f="src-tauri/tauri.conf.json",fs=require("fs"),p=JSON.parse(fs.readFileSync(f,"utf8"));p.version=process.argv[1];fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$VERSION"
# Cargo.toml: the FIRST `version = "..."` under [package].
perl -0pi -e 's/^(version\s*=\s*")[^"]+(")/${1}'"$VERSION"'${2}/m' src-tauri/Cargo.toml
# Keep Cargo.lock's petomato entry in sync (best-effort; ignored if cargo absent).
( cd src-tauri && cargo update -p petomato --precise "$VERSION" >/dev/null 2>&1 ) || true

echo "==> Committing + tagging $TAG"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock 2>/dev/null || \
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release: $TAG"
git tag -a "$TAG" -m "Petomato $TAG"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Pushing $BRANCH + $TAG (triggers the release workflow)"
git push origin "$BRANCH"
git push origin "$TAG"

echo "==> Done. Watch the build:"
echo "    https://github.com/Reneuwumuhire/petomato/actions"
