#!/usr/bin/env bash
# Gives module repos read access to the private engine and Controllerist repos, for the
# "Publish module" workflow (.github/workflows/publish.yml in each module repo).
#
#   scripts/ci-keys.sh PatchSynth StepSequencer ...
#
# First run: makes two read-only deploy keys in ~/.ssh/alive-module-ci/ and adds their public
# halves to jimsimonz/AliveEngine and jimsimonz/Controllerist. Every run: stores the private
# halves as ENGINE_DEPLOY_KEY and CONTROLLERIST_DEPLOY_KEY secrets in each named module repo.
set -euo pipefail
owner=jimsimonz
dir="$HOME/.ssh/alive-module-ci"
mkdir -p "$dir" && chmod 700 "$dir"

key() { # name repo
  local f="$dir/$1"
  if [ ! -f "$f" ]; then
    # The comment names the repo: webfactory/ssh-agent uses it to pick the key for that repo.
    ssh-keygen -q -t ed25519 -N "" -C "git@github.com:$owner/$2.git" -f "$f"
    gh repo deploy-key add "$f.pub" -R "$owner/$2" -t "Module CI (read-only)"
    echo "Deploy key added to $owner/$2"
  fi
}
key engine AliveEngine
key controllerist Controllerist

for repo in "$@"; do
  gh secret set ENGINE_DEPLOY_KEY -R "$owner/$repo" < "$dir/engine"
  gh secret set CONTROLLERIST_DEPLOY_KEY -R "$owner/$repo" < "$dir/controllerist"
  echo "Secrets set on $owner/$repo"
done
