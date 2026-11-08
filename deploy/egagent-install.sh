#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "EGAgent must be installed as root."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required before installing EGAgent."
  exit 1
fi

install_dir=/opt/egagent
mkdir -p "$install_dir/bin" /var/lib/egagent /etc/egagent
chmod 0750 "$install_dir" /var/lib/egagent

token_file=/etc/egagent/token
if [ ! -s "$token_file" ]; then
  openssl rand -hex 32 > "$token_file"
  chmod 0600 "$token_file"
fi

docker network inspect egpanel >/dev/null 2>&1 || docker network create --internal egpanel

cat > /etc/systemd/system/egagent.service <<'UNIT'
[Unit]
Description=EGAgent
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/egagent/environment
ExecStart=/opt/egagent/bin/egagent
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/egagent/environment <<ENV
EGAGENT_PORT=8443
EGAGENT_STATE_DIR=/var/lib/egagent
EGAGENT_TOKEN=$(cat "$token_file")
ENV
chmod 0600 /etc/egagent/environment

echo "EGAgent installation prepared."
echo "Copy /opt/egagent/bin/egagent to $install_dir/bin, then run:"
echo "systemctl daemon-reload && systemctl enable --now egagent"
