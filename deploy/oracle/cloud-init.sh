#!/bin/bash
# Paste this into "Initialization script" when creating an Oracle Cloud Ubuntu instance.
# It installs Docker, opens ports 80/443, and starts the API with HTTPS on <public-ip>.sslip.io.
set -euxo pipefail
exec > /var/log/stickify-setup.log 2>&1

# Oracle's Ubuntu images block everything but SSH in iptables, on top of the cloud firewall.
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save

apt-get update
apt-get install -y git
curl -fsSL https://get.docker.com | sh

git clone https://github.com/Ogunleye-Similoluwa/stickify.git /opt/stickify

PUBLIC_IP=$(curl -fsS https://api.ipify.org)
echo "SITE_ADDRESS=${PUBLIC_IP//./-}.sslip.io" > /opt/stickify/deploy/oracle/.env

cd /opt/stickify/deploy/oracle
docker compose up -d --build

# Deploy new commits automatically, like Render did.
echo "*/5 * * * * root /opt/stickify/deploy/oracle/update.sh >> /var/log/stickify-update.log 2>&1" > /etc/cron.d/stickify-update
