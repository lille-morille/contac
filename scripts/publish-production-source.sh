#!/usr/bin/env bash
set -euo pipefail

# This workspace has no writable Git metadata. Publish a clean snapshot through
# a temporary clone so local credentials and build outputs never reach GitHub.
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
checkout_dir="$(mktemp -d)"
trap 'rm -rf "$checkout_dir"' EXIT

gh repo clone lille-morille/contac "$checkout_dir" -- --branch main --single-branch
rsync -rlt --delete \
  --exclude='.git/' \
  --exclude='.agents/' \
  --exclude='.codex/' \
  --include='.env.example' \
  --exclude='.env*' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='*.tsbuildinfo' \
  --exclude='supabase/.temp/' \
  --exclude='supabase/.branches/' \
  --exclude='supabase/.profiles/' \
  "$source_dir/" "$checkout_dir/"

git -C "$checkout_dir" add -A
if git -C "$checkout_dir" diff --cached --quiet; then
  echo 'No source changes to publish.'
  exit 0
fi
git -C "$checkout_dir" -c user.name='Contac Deployment' \
  -c user.email='deploy@contac.plingapp.no' commit -m 'Publish Contac source'
git -C "$checkout_dir" push origin main
