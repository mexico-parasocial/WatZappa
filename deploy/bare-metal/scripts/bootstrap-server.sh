#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root, for example: sudo $0" >&2
  exit 1
fi

apt-get update
apt-get install -y \
  ca-certificates \
  caddy \
  curl \
  git \
  postgresql \
  redis-server \
  ufw

install -d -o root -g root -m 0755 /etc/para
install -d -o root -g root -m 0755 /srv/para
install -d -o root -g root -m 0755 /srv/para/pds
install -d -o root -g root -m 0755 /srv/para/blobstore

systemctl enable --now postgresql
systemctl enable --now redis-server
systemctl enable --now caddy

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

cat <<'MSG'
Base packages and directories are ready.

Next steps:
1. Create the Postgres role/database for the app.
2. Copy env.production.example to /etc/para/para-backend.env and edit it.
3. Copy the Caddyfile and systemd unit into place.
4. Build the repo as the deploy user.
MSG
