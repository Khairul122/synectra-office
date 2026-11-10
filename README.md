# Synectra office

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Fondasi workspace aplikasi kantor. Gunakan Node 24.19.0 dan pnpm 12.9.1.

Salin `.env.example` menjadi `.env`, lalu jalankan `pnpm install --frozen-lockfile` dan `pnpm dev`. Buka http://127.0.0.1:5173; health backend tersedia di http://127.0.0.1:3000/health. Proxy Vite membaca host dan port backend dari `.env`.

Jalankan `pnpm build`, `pnpm typecheck`, `pnpm architecture`, dan `pnpm test` untuk pemeriksaan lokal. Variabel wajib `APP_HOST` dan `APP_PORT` divalidasi saat backend mulai. Jangan simpan secret di `.env.example` atau commit `.env`.

Login Google memerlukan konfigurasi Firebase Web pada `.env` di root proyek, terutama `VITE_FIREBASE_API_KEY` yang valid. Gunakan konfigurasi aplikasi Web dari project Firebase yang sama dengan backend; mulai ulang server web setelah mengubah `.env`. Vite membaca variabel frontend berawalan `VITE_` dari root dan meneruskan `/auth` serta `/api` ke backend. Jangan memberi awalan `VITE_` pada service account atau secret server. Jika konfigurasi login belum tersedia, halaman menampilkan pesan dan tombol login dinonaktifkan; akses kantor tetap memerlukan login.

## Lingkungan development

Web dan backend dijalankan pada localhost. Firebase cloud digunakan hanya sebagai database Cloud Firestore melalui Admin SDK pada backend. Login dan sesi merupakan fitur backend aplikasi. PDF, tanda tangan, bukti pembayaran serta backup file berada pada disk lokal privat.

Integrasi Firestore dan login/file lokal dirinci pada T05 dan masih berstatus todo. Konfigurasi credential IAM dipasang server-side saat task tersebut dilaksanakan. Internet diperlukan untuk database cloud, WhatsApp dan provider model.

- [PRD](D:/portofolio/synectra-office/PRD.md).
- [TODO](D:/portofolio/synectra-office/TODO.md).
- [Task Firestore dan layanan lokal](D:/portofolio/synectra-office/tasks/T05.md).
- [Validasi batas localhost](D:/portofolio/synectra-office/tasks/T24.md).

## Kantor isometrik 2.5D

Tampilan kantor menggunakan Canvas 2D dengan satu sudut isometrik tetap. Klik karakter atau titik interaksi untuk membuka panel; menu `Jelajahi objek` menyediakan jalur keyboard yang sama. Tarik untuk menggeser tampilan, gunakan scroll atau tombol untuk zoom, dan gunakan fokus ruangan atau reset untuk bernavigasi.

Peta dan empat karakter merupakan ilustrasi baru. Setiap karakter memiliki pose diam, berjalan, bekerja, minum, dan istirahat; berjalan dan mengetik memakai empat frame. Pose lain menggunakan satu ilustrasi dan gerakan ringan. Pemilik dapat berjalan dari ruang pemilik ke pantry dan lounge, lalu kembali. Panel staf menyediakan pilihan pose visual di tempat. Aktivitas ini merupakan simulasi dekoratif lokal.

Mode tenang dan reduced motion menjeda animasi; tab tersembunyi menghentikan render. Preferensi suasana dan kualitas disimpan pada browser ini, belum per akun.

Mode hemat memakai DPR 1. Pratinjau visual terisolasi tersedia di http://127.0.0.1:5173/scripts/assets/preview.html saat server web berjalan; data dan layanan bisnis tidak dimuat di sana.

Panel komunikasi mempertahankan integrasi WhatsApp yang sudah ada. Nota, PDF produksi, arsip, Kanban, jadwal, dan chat Hermes belum mempunyai layanan operasional di kantor; panel menyatakan ketersediaan tersebut. Tidak ada inference, pengiriman pesan, atau cron yang dipicu animasi.

Jalankan `pnpm --filter @synectra/web assets:check` ketika server web aktif untuk memeriksa pemuatan, perjalanan pemilik, panel, fokus, dan pemulihan setelah aset gagal dimuat. Mobile fisik dan login bisnis end-to-end masih memerlukan pengujian. Peta yang digambar sebagai satu gambar membatasi penutupan karakter oleh furnitur.
