#!/usr/bin/env bash
set -euo pipefail

base=/opt/kale-savaslari
release="$base/releases/20261015-1735"
id kaleweb >/dev/null 2>&1 || useradd --system --home-dir "$base" --shell /usr/sbin/nologin kaleweb
if [ ! -f "$base/shared/app.env" ]; then
    umask 077
    {
        printf 'NODE_ENV=production\nHOST=127.0.0.1\nPORT=3001\nADMIN_USERNAME=admin\n'
        printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 16)"
        printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 48)"
        printf 'DATA_DIR=%s/shared/data\nUPLOAD_DIR=%s/shared/uploads\nPUBLIC_WIKI=true\n' "$base" "$base"
    } > "$base/shared/app.env"
fi
# Oyun API anahtarı yoksa ekle (yeni ve eski kurulumlar; oyun sunucusu aynı değeri KALE2_GAME_TOKEN olarak kullanır)
grep -q '^GAME_API_TOKEN=' "$base/shared/app.env" || printf 'GAME_API_TOKEN=%s\n' "$(openssl rand -hex 32)" >> "$base/shared/app.env"
chown -R kaleweb:kaleweb "$base/shared"
chmod 600 "$base/shared/app.env"
ln -sfn "$release" "$base/current"
install -m 644 "$release/deploy/kale-savaslari.service" /etc/systemd/system/kale-savaslari.service
systemctl daemon-reload
systemctl enable --now kale-savaslari.service
for attempt in {1..20}; do
    if curl -fsS http://127.0.0.1:3001/ -o /dev/null; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:3001/ -o /dev/null
install -m 644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/kale2
nginx -t
systemctl reload nginx
systemctl is-active kale-savaslari.service
