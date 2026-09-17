#!/usr/bin/env bash
# Deploy de Spectra en la VPS. Se ejecuta en cada push a main (GitHub Actions)
# o manualmente:  bash deploy.sh
set -euo pipefail

# Ir a la raíz del repo (donde vive este script)
cd "$(dirname "$0")"
echo "== Spectra deploy $(date '+%Y-%m-%d %H:%M:%S') =="

git fetch --all --prune
git reset --hard origin/main

# ---------------- Backend ----------------
cd backend
if command -v composer >/dev/null 2>&1; then
  composer install --no-dev --optimize-autoloader --no-interaction
else
  echo "AVISO: composer no encontrado; se omite (vendor/ debe existir ya)"
fi
mkdir -p storage/cache storage/logs public/uploads/compliance
chmod -R 775 storage public/uploads 2>/dev/null || true

# ---------------- Frontend (opcional) ----------------
if [ -d ../front ] && command -v npm >/dev/null 2>&1; then
  cd ../front
  npm ci --no-audit --no-fund
  npm run build
fi

echo "== Deploy OK =="
