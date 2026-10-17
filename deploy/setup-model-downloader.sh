#!/usr/bin/env bash
set -euo pipefail
# Run once on the application host. The worker runs as a private subprocess
# of the admin API and needs no public port or separate systemd service.
base=/opt/kale-savaslari
python3 -m venv "$base/shared/model-downloader-venv"
"$base/shared/model-downloader-venv/bin/pip" install -r "$base/current/services/model-downloader/requirements.txt"
setting="MODEL_DOWNLOADER_PYTHON=$base/shared/model-downloader-venv/bin/python"
if ! grep -q '^MODEL_DOWNLOADER_PYTHON=' "$base/shared/app.env"; then
    printf '\n%s\n' "$setting" >> "$base/shared/app.env"
fi
chown -R kaleweb:kaleweb "$base/shared/model-downloader-venv"
systemctl restart kale-savaslari.service
