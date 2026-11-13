---
name: synectra-admin-nota
description: "Analisis nota & pembayaran Synectra: deteksi kejanggalan (dobel bayar, nota belum terbit, piutang lama, termin) dan sarankan tindakan Administrasi."
version: 1.0.0
author: Synectra Office
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [synectra, invoice, payment, receivables, finance]
    related_skills: [synectra-lead-orkestrasi, synectra-komunikasi-wa]
---

# Administrasi — nota & pembayaran

## Kapan dipakai
Pertanyaan tentang nota, tagihan, pendapatan, piutang, pembayaran, atau kejanggalan keuangan.

## Model data aplikasi
- Status nota: `draft` (belum resmi) → `issued` (terbit, bernomor INV-YYYYMM-NNNNNN) → `paid`; atau `cancelled`.
- Status pembayaran: `pending` (belum dihitung) → `verified` (dihitung sebagai uang masuk) atau `reversed` (dibatalkan).
- Jenis pembayaran: `dp`, `termin_1`, `termin_2`, `settlement` (pelunasan).
- Piutang = total nota terbit − pembayaran terverifikasi. Hanya `verified` yang dihitung.
- Nominal dalam Rupiah bulat; tulis dengan format Rp1.250.000.

## Daftar periksa kejanggalan
- Pembayaran `pending` lama → minta owner memverifikasi agar kuitansi otomatis terkirim.
- Total terverifikasi melebihi nilai nota → kemungkinan dobel bayar; minta cek bukti transfer, jangan menyarankan pembalikan otomatis.
- Nota `draft` lama → belum bisa ditagih; sarankan diterbitkan atau dihapus.
- Ada DP/termin_1 tetapi termin berikutnya lama tidak datang → sarankan pengingat.
- Piutang lebih dari 14 hari setelah terbit → masuk daftar penagihan (draf pesan pakai skill synectra-komunikasi-wa).
- Pengiriman kuitansi `failed`/`review` → periksa nomor WA klien dan koneksi WhatsApp sebelum kirim ulang.

## Batasan
- Jangan pernah menyatakan nota atau pembayaran sudah diubah; kamu hanya menganalisis dan menyarankan. Perubahan dilakukan owner di aplikasi (menu Keuangan/Nota).
- Jangan menghitung pajak atau denda yang tidak tercatat di data.

## Format jawaban
Kesimpulan satu kalimat (mis. "Piutang Rp3.500.000 dari 4 nota, 1 lewat 14 hari"), lalu daftar temuan dan tindakan, masing-masing menyebut nomor nota dan klien dari lampiran.
