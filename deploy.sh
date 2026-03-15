#!/usr/bin/env bash
# deploy.sh — Déploiement complet KoriCompta vers le VPS
# Usage : ./deploy.sh
set -euo pipefail

VPS="root@168.119.189.67"
REMOTE="/opt/koricompta"

echo "▶ 1/5 Build frontend..."
cd "$(dirname "$0")/frontend"
npm run build
cd ..

echo "▶ 2/5 Sync frontend dist..."
sshpass -p 'sonofthesky' rsync -a --delete \
  frontend/dist/ "$VPS:$REMOTE/frontend/dist/"

echo "▶ 3/5 Sync backend..."
sshpass -p 'sonofthesky' rsync -a \
  backend/apps/ "$VPS:$REMOTE/backend/apps/"
sshpass -p 'sonofthesky' rsync -a \
  backend/config/ "$VPS:$REMOTE/backend/config/"
sshpass -p 'sonofthesky' rsync -a \
  backend/requirements.txt "$VPS:$REMOTE/backend/"
sshpass -p 'sonofthesky' rsync -a \
  Dockerfile docker-entrypoint.sh "$VPS:$REMOTE/"

echo "▶ 4/5 Rebuild image Docker..."
sshpass -p 'sonofthesky' ssh "$VPS" \
  "cd $REMOTE && docker compose build web"

echo "▶ 5/5 Redémarrage et migrations..."
sshpass -p 'sonofthesky' ssh "$VPS" \
  "cd $REMOTE && docker compose up -d --force-recreate web"

echo ""
echo "✓ Déploiement terminé — http://168.119.189.67:8080"
