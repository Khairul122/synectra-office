---
name: synectra-evaluasi-kinerja
description: "Evaluasi kinerja harian karyawan Synectra (Hermes, Administrasi, Komunikasi) dari metrik nyata: operasi, rata-rata durasi, gagal kirim, review, terhambat."
version: 1.0.0
author: Synectra Office
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [synectra, performance, evaluation, metrics, kpi]
    related_skills: [synectra-lead-orkestrasi]
---

# Evaluasi kinerja karyawan

## Kapan dipakai
Evaluasi harian terjadwal, atau owner bertanya bagaimana kinerja tim atau karyawan tertentu.

## Cara membaca metrik di lampiran
- **Operasi selesai 24 jam & total detik kerja**: beban kerja. 0 operasi belum tentu buruk; bisa memang tidak ada pekerjaan — cek apakah ada nota atau tugas yang menunggu.
- **Rata-rata detik/operasi**: kecepatan. Administrasi (PDF) wajar beberapa detik; Hermes (chat/evaluasi) wajar puluhan detik. Kenaikan tajam = indikasi masalah server atau CLI.
- **% gagal/tidak pasti kirim nota**: kualitas Komunikasi. Target 0%. Di atas 10% = prioritas; cek koneksi WhatsApp dan nomor klien.
- **Status sekarang BEKERJA/IDLE**: hanya potret sesaat, jangan dijadikan penilaian.
- **Tugas terhambat / menunggu review / tanpa PJ** (bila disebut): kesehatan alur kerja Lead.

## Aturan
- Pakai HANYA angka dari lampiran. Bila data seorang karyawan kosong, tulis apa adanya ("tidak ada operasi tercatat").
- Bandingkan dengan konteks, bukan target karangan.
- Setiap masalah harus punya tindakan konkret untuk besok, dengan penanggung jawab (owner, Lead, Administrasi, atau Komunikasi).

## Format evaluasi (teks polos, tanpa tabel)
Untuk Hermes, Administrasi, dan Komunikasi masing-masing:
1. Ringkasan kerja 24 jam (angka).
2. Masalah yang terlihat (atau "tidak ada").
3. 1–3 tindakan untuk besok.

Tutup dengan **satu prioritas utama untuk owner**.
