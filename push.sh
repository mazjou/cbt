#!/bin/bash
# ============================================================
# push.sh - Upload kode ke GitHub dari laptop
# Cara pakai: bash push.sh "pesan commit"
# Contoh:     bash push.sh "fix bug login"
# ============================================================

REPO_URL="https://github.com/mazjou/cbt.git"
BRANCH="main"

# Warna
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

# ── Cek git sudah init ────────────────────────────────────
if [ ! -d ".git" ]; then
  warn "Git belum diinit. Inisialisasi sekarang..."
  git init
  git branch -M $BRANCH
  git remote add origin $REPO_URL
  log "Git diinisialisasi"
fi

# ── Cek remote sudah ada ──────────────────────────────────
if ! git remote get-url origin &>/dev/null; then
  git remote add origin $REPO_URL
  log "Remote origin ditambahkan"
fi

# ── Pesan commit ──────────────────────────────────────────
if [ -z "$1" ]; then
  # Auto-generate pesan commit dari file yang berubah
  CHANGED=$(git diff --name-only HEAD 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//')
  if [ -z "$CHANGED" ]; then
    COMMIT_MSG="update $(date '+%Y-%m-%d %H:%M')"
  else
    COMMIT_MSG="update: $CHANGED"
  fi
else
  COMMIT_MSG="$1"
fi

echo "📝 Pesan commit: $COMMIT_MSG"
echo ""

# ── Cek ada perubahan ─────────────────────────────────────
git add -A

STATUS=$(git status --porcelain)
if [ -z "$STATUS" ]; then
  warn "Tidak ada perubahan untuk di-push."
  echo ""
  exit 0
fi

# Tampilkan file yang berubah
echo "📁 File yang berubah:"
git status --short
echo ""

# ── Commit & Push ─────────────────────────────────────────
git commit -m "$COMMIT_MSG"

# Push ke GitHub
if git push -u origin $BRANCH 2>&1; then
  echo ""
  log "Berhasil push ke GitHub!"
  log "URL: https://github.com/mazjou/cbt"
  echo ""
  echo "========================================"
  echo "  Sekarang jalankan update di VPS:"
  echo "  ssh root@IP_VPS 'bash /cbt/update.sh'"
  echo "========================================"
else
  echo ""
  warn "Push gagal. Coba pull dulu:"
  echo "  git pull origin main --rebase"
  echo "  bash push.sh \"$COMMIT_MSG\""
fi

echo ""
