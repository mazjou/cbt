#!/bin/bash
# ============================================================
# Monitor LMS saat ujian berlangsung
# Jalankan: bash /cbt/scripts/monitor-ujian.sh
# Stop: Ctrl+C
# ============================================================

LOG="/cbt/logs/monitor-ujian.log"
HEALTHZ="http://10.10.102.11:3000/healthz"

echo "🔍 Monitor ujian dimulai: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a $LOG
echo "   Tekan Ctrl+C untuk stop"
echo ""

while true; do
  TIMESTAMP=$(date '+%H:%M:%S')

  # Cek health Node.js
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $HEALTHZ)

  # Cek PM2 instance yang down
  DOWN=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
down=[p['name']+'#'+str(p['pm_id']) for p in data if p['pm2_env']['status']!='online']
print(','.join(down) if down else '')
" 2>/dev/null)

  # Cek RAM
  RAM_USED=$(free -m | awk '/Mem:/{printf "%.0f%%", $3/$2*100}')
  
  # Cek jumlah attempt aktif (siswa sedang ujian)
  # (opsional jika ada akses ke DB dari sini)

  if [ "$HTTP_STATUS" != "200" ]; then
    MSG="⚠️  [$TIMESTAMP] ALERT: Node.js tidak respond! HTTP=$HTTP_STATUS"
    echo "$MSG" | tee -a $LOG
    # Otomatis reload jika down
    pm2 reload all >> $LOG 2>&1
    echo "   → pm2 reload dijalankan otomatis" | tee -a $LOG
  elif [ -n "$DOWN" ]; then
    MSG="⚠️  [$TIMESTAMP] ALERT: Instance down: $DOWN"
    echo "$MSG" | tee -a $LOG
    pm2 reload all >> $LOG 2>&1
    echo "   → pm2 reload dijalankan otomatis" | tee -a $LOG
  else
    echo "✅ [$TIMESTAMP] OK — HTTP=$HTTP_STATUS | RAM=$RAM_USED | PM2=semua online"
  fi

  sleep 30
done
