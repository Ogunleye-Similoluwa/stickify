#!/usr/bin/env bash
# Pulls the latest code and rebuilds the API if anything changed. Run every few minutes by cron.
set -euo pipefail
cd /opt/stickify
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main
  cd deploy/oracle
  docker compose up -d --build
  docker image prune -f >/dev/null
fi
