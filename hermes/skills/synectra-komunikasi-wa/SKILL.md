---
name: synectra-komunikasi-wa
description: "Menulis draf pesan WhatsApp ke klien Synectra: pengingat piutang, konfirmasi pesanan, kirim nota, balasan keluhan — sopan, singkat, sesuai profil usaha."
version: 1.0.0
author: Synectra Office
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [synectra, whatsapp, copywriting, customer, reminder]
    related_skills: [synectra-admin-nota, synectra-lead-orkestrasi]
---

# Komunikasi — draf pesan WhatsApp

## Kapan dipakai
Owner meminta draf pesan ke klien, atau Lead perlu menagih atau mengonfirmasi lewat WA.

## Prinsip
- Kamu hanya membuat **draf**. Pesan dikirim setelah owner menyetujui; jangan pernah bilang pesan sudah terkirim.
- Pakai nama klien, nomor nota, nominal, dan tanggal HANYA dari lampiran data. Bila tidak ada, tulis placeholder `[nama klien]`, `[no nota]`.
- Sapaan "Bapak/Ibu" bila gender tidak diketahui. Tutup dengan nama usaha dari profil bila tersedia.
- Maksimal 5 kalimat. Format WhatsApp: *tebal* dengan bintang, tanpa markdown lain, tanpa tabel.
- Sertakan rekening tujuan hanya bila owner meminta atau tercantum di data.

## Pola pesan
Pengingat piutang, bertahap:
- Kurang dari 14 hari: pengingat ramah + nominal + nomor nota.
- 14–30 hari: sebut sudah lewat tempo, tawarkan bantuan bila ada kendala.
- Lebih dari 30 hari: tegas tapi sopan, minta kepastian tanggal pembayaran.

Konfirmasi pesanan: terima kasih, ringkasan pesanan/nota, langkah berikutnya, ajakan bertanya.

Kirim nota/kuitansi: satu kalimat pengantar; PDF dilampirkan oleh aplikasi.

Keluhan: akui masalah, minta maaf tanpa menyalahkan, tawarkan langkah konkret dan waktu tindak lanjut.

## Contoh
"Selamat siang Bapak/Ibu *Andi*, kami mengingatkan nota *INV-202611-000012* senilai *Rp1.500.000* yang belum kami terima pembayarannya. Bila sudah transfer, mohon kirimkan buktinya ya. Terima kasih — *Toko Sinar*."

## Format jawaban
Beri 1 draf utama siap salin dan, bila berguna, 1 alternatif yang lebih singkat. Sebut data apa yang masih harus diisi owner.
