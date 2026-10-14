#!/bin/bash
# Script: clear-exam-cache.sh
# Fungsi: Hapus HANYA cache exam/soal di Redis, TANPA menghapus session siswa
# Aman dijalankan saat ujian berlangsung
#
# Penggunaan: bash /cbt/scripts/clear-exam-cache.sh

REDIS_HOST="10.10.102.8"
REDIS_PORT="6379"
REDIS_PASS="redisCBT2026"

R="redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASS --no-auth-warning"

echo "=== Clear Exam Cache (AMAN - tidak hapus session) ==="
echo ""

# 1. Cache metadata ujian per kelas (student:exams:meta:*)
COUNT1=$($R --scan --pattern "student:exams:meta:*" | wc -l)
if [ "$COUNT1" -gt "0" ]; then
  $R --scan --pattern "student:exams:meta:*" | while read key; do $R DEL "$key" > /dev/null; done
  echo "✅ Hapus $COUNT1 cache metadata ujian (student:exams:meta:*)"
else
  echo "ℹ️  Tidak ada cache student:exams:meta:*"
fi

# 2. Cache soal ujian (exam:questions:*)
COUNT2=$($R --scan --pattern "exam:questions:*" | wc -l)
if [ "$COUNT2" -gt "0" ]; then
  $R --scan --pattern "exam:questions:*" | while read key; do $R DEL "$key" > /dev/null; done
  echo "✅ Hapus $COUNT2 cache soal ujian (exam:questions:*)"
else
  echo "ℹ️  Tidak ada cache exam:questions:*"
fi

# 3. Cache lms:exam* (kalau ada)
COUNT3=$($R --scan --pattern "lms:exam*" | wc -l)
if [ "$COUNT3" -gt "0" ]; then
  $R --scan --pattern "lms:exam*" | while read key; do $R DEL "$key" > /dev/null; done
  echo "✅ Hapus $COUNT3 cache lms:exam*"
else
  echo "ℹ️  Tidak ada cache lms:exam*"
fi

# Tampilkan sisa key (hanya session yang boleh tersisa)
REMAINING=$($R DBSIZE)
SESSION_COUNT=$($R --scan --pattern "lms:sess:*" | wc -l)
echo ""
echo "=== Hasil ==="
echo "Total key di Redis : $REMAINING"
echo "Session aktif      : $SESSION_COUNT"
echo ""
echo "✅ Cache exam bersih. Session siswa TIDAK terganggu."
