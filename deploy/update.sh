#!/usr/bin/env bash
# Sunucuda root olarak: bash /opt/kale-savaslari/current/deploy/update.sh
set -euo pipefail

base=/opt/kale-savaslari
branch="${DEPLOY_BRANCH:-claude/gallant-cray-9iq0is}"
repo="${DEPLOY_REPO:-https://github.com/berken55/kale2-web.git}"
stamp="$(date +%Y%m%d-%H%M%S)"
release="$base/releases/$stamp"

mkdir -p "$base/releases"
echo "==> Release $stamp ($branch)"
git clone --depth 1 --branch "$branch" "$repo" "$release"

cd "$release"
npm ci
npm run build

ln -sfn "$release" "$base/current"
chown -R kaleweb:kaleweb "$release"

if [ -f "$release/deploy/setup-model-downloader.sh" ]; then
  if ! dpkg -s python3-venv >/dev/null 2>&1; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv
  fi
  bash "$release/deploy/setup-model-downloader.sh" || {
    if [ -x "$base/shared/model-downloader-venv/bin/pip" ]; then
      "$base/shared/model-downloader-venv/bin/pip" install -r "$release/services/model-downloader/requirements.txt"
      chown -R kaleweb:kaleweb "$base/shared/model-downloader-venv"
    fi
  }
fi

install -m 644 "$release/deploy/kale-savaslari.service" /etc/systemd/system/kale-savaslari.service
systemctl daemon-reload
systemctl restart kale-savaslari.service

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3001/ -o /dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3001/ -o /dev/null

if [ -f "$release/deploy/nginx.conf" ]; then
  install -m 644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/kale2
  ln -sfn /etc/nginx/sites-available/kale2 /etc/nginx/sites-enabled/kale2 2>/dev/null || true
  nginx -t
  systemctl reload nginx
fi

systemctl is-active kale-savaslari.service
echo "==> Deploy OK: $release"
