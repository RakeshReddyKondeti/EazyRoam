#!/usr/bin/env bash
# Deploy EazyRoam to the Vultr VM. Owner: B.
# Usage: VULTR_HOST=root@203.0.113.10 DOMAIN=eazyroam.app ./deploy/deploy.sh
# Needs on the VM: Docker with the compose plugin. Needs locally: .env.production (real keys, USE_FIXTURES=0).
# DNS: point the domain's A record (GoDaddy Registry) at the VM's IP before the first run, so Caddy can get a certificate.
set -euo pipefail

: "${VULTR_HOST:?set VULTR_HOST, e.g. root@203.0.113.10}"
: "${DOMAIN:?set DOMAIN, e.g. eazyroam.app}"
DIR=/opt/eazyroam
cd "$(dirname "$0")/.."

[ -f .env.production ] || { echo "Missing .env.production (copy .env.example and fill in keys)"; exit 1; }

echo "→ Syncing code to $VULTR_HOST:$DIR"
ssh "$VULTR_HOST" "mkdir -p $DIR"
rsync -az --delete --exclude node_modules --exclude .next --exclude .git --exclude '.env*' ./ "$VULTR_HOST:$DIR/"
scp -q .env.production "$VULTR_HOST:$DIR/.env.production"

echo "→ Building and starting containers"
ssh "$VULTR_HOST" "cd $DIR/deploy && DOMAIN=$DOMAIN docker compose up -d --build && docker compose ps"

echo "✓ Deployed: https://$DOMAIN"
