# Synectra office

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Fondasi workspace aplikasi kantor. Gunakan Node 24.19.0 dan pnpm 12.9.1.

Salin `.env.example` menjadi `.env`, lalu jalankan `pnpm install --frozen-lockfile` dan `pnpm dev`. Buka http://127.0.0.1:5173; health backend tersedia di http://127.0.0.1:3000/health. Proxy Vite membaca host dan port backend dari `.env`.

Jalankan `pnpm build`, `pnpm typecheck`, `pnpm architecture`, dan `pnpm test` untuk pemeriksaan lokal. Variabel wajib `APP_HOST` dan `APP_PORT` divalidasi saat backend mulai. Jangan simpan secret di `.env.example` atau commit `.env`.

## Lingkungan development

Web dan backend dijalankan pada localhost. Firebase cloud digunakan hanya sebagai database Cloud Firestore melalui Admin SDK pada backend. Login dan sesi merupakan fitur backend aplikasi. PDF, tanda tangan, bukti pembayaran serta backup file berada pada disk lokal privat.

Integrasi Firestore dan login/file lokal dirinci pada T05 dan masih berstatus todo. Konfigurasi credential IAM dipasang server-side saat task tersebut dilaksanakan. Internet diperlukan untuk database cloud, WhatsApp dan provider model.

- [PRD](D:/portofolio/synectra-office/PRD.md).
- [TODO](D:/portofolio/synectra-office/TODO.md).
- [Task Firestore dan layanan lokal](D:/portofolio/synectra-office/tasks/T05.md).
- [Validasi batas localhost](D:/portofolio/synectra-office/tasks/T24.md).
