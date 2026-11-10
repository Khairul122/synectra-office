# Aturan Agen Synectra Office

Aturan berlaku hanya untuk project ini.

## Otorisasi kerja

- User mengizinkan agen menjalankan proses project tanpa meminta persetujuan perintah perintah.
- Agen boleh membaca, mengedit, dan menulis file project, termasuk `.env`, saat dibutuhkan untuk tugas project.
- Agen boleh menjalankan command, test, build, mengakses web, memakai subagent, dan mengubah konfigurasi project.
- Tampilkan rencana singkat bila membantu, tetapi jangan menunggu persetujuan sebelum eksekusi.
- Jika tindakan berisiko irreversible di luar kebutuhan task, minta konfirmasi khusus.
- Jangan commit atau push kecuali user meminta jelas.
- Setelah tugas selesai, berhenti dan berikan laporan ringkas.

## Environment dan Firestore

- Gunakan `pnpm`.
- Saat memeriksa atau menjalankan backend, muat `.env` project.
- Periksa nilai `FIREBASE_USE_FIRESTORE` sebelum menyimpulkan persistence memakai memory store.
- Jika `FIREBASE_USE_FIRESTORE=true`, verifikasi credential Admin SDK dan koneksi Firestore sebelum menyimpulkan data tidak tersimpan.
- Persistence Firestore memakai database `default`.
- Data privat harus owner-scoped.
- Jangan menjalankan test memory-store lalu menyebutnya sebagai bukti data Firestore.
- Saat perlu bukti Firestore, jalankan smoke test dengan environment project aktif dan laporkan collection/document yang diverifikasi tanpa mencetak secret.

## Secret

- Boleh membaca dan mengubah `.env` setelah persetujuan user.
- Jangan mencetak nilai secret, token, private key, service-account JSON, atau isi credential.
- Saat melaporkan konfigurasi, tampilkan hanya `set`, `missing`, `true`, `false`, atau path tanpa isi secret.
- Jangan menyalin secret ke source code, log, test output, atau dokumentasi.

## Validasi

- Setelah perubahan kode, jalankan pemeriksaan relevan:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Untuk task Firestore, jalankan koneksi dan read/write smoke test bila credential tersedia.
- Catat hasil lulus/gagal, warning, dan keterbatasan aktual.
- Jangan menandai task `done` jika acceptance criteria belum diuji; gunakan `review` dan tulis gap yang tersisa.

## Gaya laporan

- Jawab bahasa Indonesia.
- Ringkas, teknis, dan faktual.
- Laporan akhir memuat perubahan, validasi, status task, dan gap/blocker.
- Jangan mengklaim browser, Firestore produksi, atau environment lain teruji jika belum benar-benar dijalankan.
