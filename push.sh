#!/bin/bash
# ============================================================
# push.sh - Upload kode ke GitHub dari laptop
# Cara pakai: bash push.sh "pesan commit"
# Contoh:     bash push.sh "fix bug login"
# ============================================================

REPO_URL="https://github.com/mazjou/cbt.git"
BRANCH="main"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "========================================"
echo "  Push ke GitHub: mazjou/cbt"
echo "========================================"
echo ""

# Cek git sudah init
if [ ! -d ".git" ]; then
  git init
  git branch -M $BRANCH
  git remote add origin $REPO_URL
  log "Git diinisialisasi"
fi

# Cek remote
if ! git remote get-url origin &>/dev/null; then
  git remote add origin $REPO_URL
fi

# Pesan commit
if [ -z "$1" ]; then
  CHANGED=$(git diff --name-only HEAD 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//')
  COMMIT_MSG="${CHANGED:-update} $(date '+%Y-%m-%d %H:%M')"
else
  COMMIT_MSG="$1"
fi

# Stage semua perubahan
git add -A

# Cek ada file baru yang belum di-commit
STATUS=$(git status --porcelain)
UNPUSHED=$(git log origin/$BRANCH..HEAD --oneline 2>/dev/null)

if [ -z "$STATUS" ] && [ -z "$UNPUSHED" ]; then
  warn "Tidak ada perubahan dan tidak ada commit yang belum di-push."
  echo ""
  exit 0
fi

# Commit jika ada file baru
if [ -n "$STATUS" ]; then
  echo "📁 File yang berubah:"
  git status --short
  echo ""
  echo "📝 Pesan commit: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG"
  echo ""
fi

# Tampilkan commit yang akan di-push
UNPUSHED=$(git log origin/$BRANCH..HEAD --oneline 2>/dev/null)
if [ -n "$UNPUSHED" ]; then
  echo "📦 Commit yang akan di-push:"
  echo "$UNPUSHED"
  echo ""
fi

# Push
if git push -u origin $BRANCH 2>&1; then
  echo ""
  log "Berhasil push ke GitHub!"
  log "URL: https://github.com/mazjou/cbt"
  echo ""
  echo "========================================"
  echo "  Update VPS: ssh root@IP_VPS 'bash /cbt/update.sh'"
  echo "========================================"
else
  echo ""
  warn "Push gagal. Coba:"
  echo "  git pull origin main --rebase"
  echo "  bash push.sh"
fi

echo ""
