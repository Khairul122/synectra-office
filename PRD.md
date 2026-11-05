# PRD Synectra office

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Dokumen kebutuhan produk, diperbarui 5 November 2026, WIB.

Root proyek `D:\portofolio\synectra-office`.

## 1. Tujuan produk

Synectra office membantu pemilik membuat nota bertanda tangan, mencatat pembayaran, dan mengirim PDF kepada klien melalui WhatsApp. Kantor isometrik 3D menjadi antarmuka kerja dengan karyawan manusia virtual, interaksi objek, dan aktivitas idle. Hermes menjadi lead agent untuk menyiapkan pekerjaan, mengelola task, dan menjalankan otomasi terjadwal.

Produk masih tahap development. Aplikasi web dan backend digunakan melalui localhost, dengan Firebase cloud khusus database Cloud Firestore. Pemilik dapat mengakses fitur bisnis melalui panel HTML dan objek kantor.

Dokumen ini menjelaskan hasil produk yang harus dipenuhi. Rincian pelaksanaan, dependensi, status, serta kriteria selesai per task tersedia pada TODO. [TODO proyek](D:/portofolio/synectra-office/TODO.md).

## 2. Pengguna dan kebutuhan

| Pengguna | Kebutuhan |
| --- | --- |
| Pemilik | Mengelola klien, nota, pembayaran, pengiriman, pekerjaan agent, dan jadwal dari satu aplikasi |
| Klien | Menerima PDF nota yang jelas melalui WhatsApp dan mengetahui pembayaran serta sisa tagihan |
| Hermes dan agent spesialis | Membaca data yang diizinkan, menyiapkan draft, mengelola task, dan memberi ringkasan kepada pemilik |

Default rancangan awal adalah satu pemilik, satu bisnis, satu nomor WhatsApp bisnis, satu lantai kantor, dan empat karakter. Nama Synectra mengikuti invoice referensi. Pilihan ini dapat disesuaikan melalui keputusan produk berikutnya.

## 3. Keputusan yang sudah ditetapkan

- Gunakan Firebase cloud hanya untuk database Cloud Firestore. Login memakai backend aplikasi dan file privat memakai disk lokal.
- Gunakan Baileys untuk koneksi WhatsApp, dengan reuse bridge Hermes yang sudah tersedia.
- Terapkan multi-layered architecture pada modular monolith.
- Nota berisi nomor, tanggal, judul, kategori, deskripsi, nominal, riwayat pembayaran, dan tanda tangan.
- Hilangkan field deadline dari kontrak nota baru, form, PDF, serta pesan pengiriman.
- Hadirkan kantor 3D dengan karakter manusia dan interaksi seperti simulasi kehidupan.
- Gunakan Hermes sebagai lead, Kanban native, dan cron.
- Batasi penggunaan aplikasi pada localhost selama development, dengan koneksi outbound ke database cloud dan layanan yang diperlukan.

## 4. Kondisi proyek saat dokumen disusun

Pemeriksaan dokumen dan source dilakukan 5 November 2026. Status runtime di bagian ini mengikuti bukti yang tercatat pada task sebelumnya.

| Area | Bukti yang tersedia | Pekerjaan lanjutan |
| --- | --- | --- |
| T01 | Catatan `done`, workspace pnpm, React/Vite, Fastify, contracts, pemeriksaan arsitektur, dan tes fondasi tersedia | Jalankan kembali pemeriksaan pada perubahan berikutnya |
| T02 | Status `done`; profil `synectra-office`, autentikasi, satu inference, dan restart fallback berhasil tercatat; health setelah restart HTTP `200` | Pantau biaya aktual secara manual |
| Batas Hermes | `agent.run_budget_seconds: 120`, `max_concurrent_sessions: 1`, dan host `max_concurrent_runs: 1` terverifikasi; allowlist `ComboHermes`; cron tidak aktif | Dampak concurrency host bersama tetap diperhitungkan sebelum otomasi |
| Biaya model | `actual_cost_usd` `null`; hard cap biaya uang belum didukung Hermes/9router terpasang | Pantau biaya di 9router; gunakan limit/budget provider atau proxy billing jika tersedia |
| T03 | Pairing nyata, pengiriman satu PDF sintetis, persistence sesi, serta validasi lokal tercatat; status `review` | Lengkapi message ID, MIME/receipt yang dapat diverifikasi, owner guard, perlindungan cross-origin, dan batas dependency application |
| Nota dan kantor | Planning, konsep visual, serta daftar task tersedia | Implementasikan fitur dan ukur hasilnya |

T02 berstatus `done` setelah verifikasi restart fallback dan nilai konfigurasi aktif. T03 berstatus `review`: pairing, pengiriman, persistence, dan pemeriksaan proyek sudah terjadi, tetapi bukti transport lengkap serta kontrol akses route belum tersedia. Hard cap biaya uang belum tersedia; tidak ada cron atau inference otomatis untuk profil kantor. [Catatan T01](D:/portofolio/synectra-office/T01.md), [catatan T02](D:/portofolio/synectra-office/T02.md).

## 5. Alur utama pemilik

1. Login lalu lihat kantor dan status layanan.
2. Klik meja administrasi atau tombol `Buat nota`.
3. Pilih klien, isi detail pesanan, item, serta pembayaran yang sudah diverifikasi.
4. Lihat preview A4 dengan tanda tangan.
5. Terbitkan snapshot nota dan PDF final.
6. Periksa penerima, caption, revisi, dan waktu pengiriman.
7. Setujui lalu kirim melalui outbox Baileys.
8. Lihat bukti pengiriman dan tangani hasil yang membutuhkan review.
9. Verifikasi pembayaran berikutnya, kemudian terbitkan revisi bila ringkasan nota perlu diperbarui.
10. Gunakan Hermes, Kanban, serta kalender untuk pekerjaan terkait.

## 6. Kebutuhan fungsional

### FR-01 — Identitas bisnis, login, dan klien

- Pemilik login melalui backend aplikasi dengan password hash scrypt serta cookie sesi HttpOnly, SameSite=Strict, expiry dan revocation yang diperiksa server.
- Simpan nama bisnis, timezone, penandatangan, serta preferensi dasar.
- Klien mempunyai nama, nomor WhatsApp, preferensi komunikasi, serta email/alamat opsional.
- Validasi nomor internasional dan normalisasi nomor Indonesia setelah validasi.
- Pencarian klien, kategori, serta arsip dapat diakses dari navigasi dan objek kantor.

### FR-02 — Nota dan revisi

- Nomor diterbitkan server-side dengan counter atomik per owner dan periode. Pola awal `INV-YYYYMM-000001`.
- Simpan judul, kategori, deskripsi, tanggal, item, total, dan status pengerjaan.
- Gunakan integer rupiah untuk nominal IDR dan aturan pembulatan eksplisit bila kuantitas pecahan dipakai.
- Draft dapat diedit dengan pemeriksaan konflik versi.
- Nota terbit menyimpan snapshot immutable, versi template, tanda tangan, dan audit actor.
- Koreksi setelah terbit menghasilkan revisi baru dengan dokumen lama tetap dapat ditelusuri.

### FR-03 — Pembayaran

- Catat DP, cicilan, pelunasan, bukti, metode, referensi, serta tanggal.
- Pemilik memverifikasi pembayaran sebelum nominal masuk total dibayar.
- Koreksi menggunakan reversal/refund beralasan dan actor audit.
- Hitung sisa minimal nol dan tampilkan kelebihan bayar secara terpisah.
- Status pengerjaan dan status pembayaran mempunyai field serta transisi sendiri.

### FR-04 — Tanda tangan dan PDF

- Pemilik mengunggah PNG transparan atau menggambar tanda tangan.
- Ikat tanda tangan versi tertentu pada revisi nota.
- PDF A4 mengikuti invoice referensi, meliputi header, penerima, detail, tabel pembayaran, total, catatan, dan tanda tangan.
- Judul panjang dan 30 baris pembayaran harus terbaca, dengan header tabel berulang serta blok tanda tangan utuh.
- Render dari snapshot melalui Chromium dengan escaping teks, font lokal, dan batas resource.
- Revisi `ready` memiliki file privat yang tersedia dan checksum sesuai. Kegagalan render/upload memiliki status yang terlihat.

### FR-05 — Pairing dan koneksi WhatsApp

- QR web tersedia bagi pemilik melalui akses yang terautentikasi dan terlindungi dari request lintas origin.
- QR mempunyai lifecycle, masa berlaku, serta status kedaluwarsa yang jelas.
- Tampilkan `unpaired`, `pairing`, `connecting`, `connected`, `reconnecting`, `logged_out`, dan `error`.
- Satu sesi nomor mempunyai satu proses pemilik koneksi dan satu consumer inbound.
- Credential dan Signal keys disimpan privat serta dipulihkan secara konsisten.
- Target uji yang tercatat pada backlog lokal adalah `082165443677`. Pastikan tujuan dan otorisasi uji saat pelaksanaan.

### FR-06 — Approval dan outbox

- Approval mengikat penerima, caption, revisi, hash PDF, waktu kirim, serta masa berlaku.
- Simpan approval dan outbox dalam satu transaksi.
- Gunakan dedupe identity, atomic claim, lease, fencing token, serta attempt audit.
- Double-click mengembalikan delivery logis yang sama.
- Retry otomatis dibatasi pada kegagalan yang terbukti belum menimbulkan efek kirim.
- Timeout setelah kemungkinan send menghasilkan `unknown` dan memerlukan rekonsiliasi.
- Bedakan `submitted`, `delivered`, dan `read` berdasarkan bukti transport atau receipt yang tersedia.
- Receipt duplicate dan out-of-order diproses idempotent dengan status monotonic.
- Sediakan unduh PDF, click-to-chat, serta konfirmasi pengiriman manual ketika diperlukan.

### FR-07 — Kantor 3D

- Gunakan scene isometric cutaway interaktif dengan kamera orthographic, zoom, pan, reset, dan fokus ruangan.
- Ruang Hermes berada di belakang kiri, ruang rapat di belakang kanan, dan dua meja staf berada di tengah.
- Pantry/lounge berada di depan kiri, resepsionis/arsip di depan kanan.
- Material utama berupa walnut gelap, kaca berbingkai hitam, lampu hangat, tanaman, dan furnitur kantor.
- Navbar tipis memuat Kantor, Nota, Kanban, Jadwal, dan aksi `Buat nota`.
- Diorama mendominasi area kerja. Drawer detail muncul mengikuti objek atau fitur yang dipilih.

### FR-08 — Manusia virtual, objek, dan idle

- Empat karakter awal mewakili pemilik, Hermes, administrasi, serta komunikasi.
- Model memakai proporsi manusia dewasa, rig humanoid, skeleton, dan mixer animasi per karakter.
- Dukung berjalan, duduk, berdiri, mengetik, bernapas, berpikir, serta transisi animasi.
- Waypoint dan interaction anchor mengatur jalur serta reservasi kursi/objek.
- Klik meja admin membuka nota, printer membuka PDF, lemari membuka arsip, papan membuka Kanban, dan kalender membuka jadwal.
- Pisahkan `work_state` backend dari `animation_state` visual.
- Idle minum, membaca, merapikan meja, dan lounge memakai aturan lokal serta cooldown.
- Aktivitas dekoratif diberi identitas yang jelas. Pekerjaan bisnis dijalankan berdasarkan state backend.
- Mode tenang, reduced motion, audio opt-in, serta penghentian animasi tab tersembunyi tersedia.

### FR-09 — Hermes sebagai lead

- Gunakan profil eksplisit `synectra-office` dan credential backend scoped.
- Tool bisnis awal mencakup pencarian klien, draft nota, preview, daftar payment, prepare delivery, serta status kantor.
- Validasi actor, owner, scope, dan operasi pada backend setiap kali tool dijalankan.
- Penerbitan final, verifikasi payment, dan pengiriman memerlukan approval yang sesuai.
- Perlakukan dokumen serta pesan klien sebagai data saat memproses permintaan agent.
- Tampilkan session, progress tool, hasil akhir, error, heartbeat, serta usage yang tersedia.
- Akses host dan credential dipisahkan melalui batas tool serta isolasi proses yang dibuktikan sebelum otomasi sensitif.

### FR-10 — Kanban dan cron

- Gunakan board native Hermes `synectra-office` dengan status serta transisi yang didukung versi runtime.
- Kartu memuat assignee, dependency, priority, artefak, review, alasan blocked, dan relasi bisnis.
- Mutasi running mengikuti claim dispatcher. Setiap operasi menentukan board dan profil.
- Sinkronisasi memakai cursor event atau polling terbatas dengan indikator waktu snapshot terakhir.
- Cron Hermes menangani briefing dan koordinasi agent. Worker aplikasi menangani jadwal delivery.
- Simpan waktu eksekusi UTC dengan zona pengguna `Asia/Jakarta`.
- Run identity, timeout, concurrency, missed-run policy, pause/resume, dan histori tersedia.

## 7. Arsitektur dan kepemilikan

| Lapisan | Tanggung jawab |
| --- | --- |
| Presentation | React, kantor 3D, form, route/controller, SSE, dan entry point worker |
| Application | Use case, otorisasi, koordinasi transaksi, approval, serta urutan efek eksternal |
| Domain | Nilai uang, aturan nota, ledger, revisi, dan transisi yang sah |
| Infrastructure | Repository Firestore, filesystem lokal privat, PDF renderer, adapter Hermes, dan adapter Baileys |
| Data dan external systems | Firebase Cloud Firestore, state sesi privat, Hermes runtime, serta WhatsApp |

Composition root memasang adapter dan konfigurasi. Domain memakai tipe serta fungsi bisnis yang bebas dependency vendor. Application memanggil kontrak I/O sesuai kebutuhan. Repository memakai transaksi Firestore untuk counter, reservasi nomor, dedupe dan claim. Callback transaksi hanya mengakses database, sedangkan efek eksternal dijalankan setelah commit. Application memeriksa session/owner, IAM membatasi server, dan Rules menolak akses client langsung.

Frontend memakai login backend serta SSE lokal terautentikasi. Backend meneruskan perubahan Firestore melalui event yang disaring per owner. Mutasi bisnis melewati use case backend. Modul mengakses modul lain melalui public entry point yang sempit. Struktur folder mengikuti workspace yang sudah tersedia.

```text
apps/web/src/app
apps/web/src/features/{invoices,clients,payments,deliveries,agents,kanban,schedules,office}
apps/server/src/bootstrap
apps/server/src/modules/<fitur>/{presentation,application,domain,infrastructure}
packages/contracts/src
firebase/firestore.rules
firebase/firestore.indexes.json
data/private
```

Stack terpilih adalah React, TypeScript, Vite, Fastify, React Three Fiber, Three.js, Drei, Firebase Cloud Firestore, Playwright Chromium, Hermes, dan Baileys. Penambahan paket mengikuti kebutuhan task dan kompatibilitas lockfile aktual.

Firebase Cloud Firestore memiliki data bisnis, snapshot, approval, outbox, audit, serta preferensi kantor. Hermes memiliki lifecycle task dan jadwal agent. Aplikasi menyimpan referensi serta proyeksi task yang dapat dibangun ulang. Bridge memiliki socket dan auth state. Browser memiliki animasi dan interpolasi posisi.

## 8. Model data

| Kelompok | Entitas |
| --- | --- |
| Identitas | accounts, sessions, business_profiles, clients, kategori layanan |
| Nota | invoice_sequences, invoice_numbers, invoices, invoice_items, invoice_revisions |
| Pembayaran dan aset | payments, signature_assets, file_assets dan metadata bukti pembayaran lokal |
| Pengiriman | delivery_approvals, delivery_keys, deliveries, delivery_attempts, delivery_events |
| Agent dan kantor | agent_bindings, task_links, office_preferences |
| Audit | audit_events |

Semua dokumen bisnis mengikat owner dan `schema_version`. Backend memvalidasi relasi pada transaksi yang relevan. Nomor nota dan dedupe identity memakai dokumen reservasi ber-ID deterministik. File PDF, signature dan bukti pembayaran disimpan pada data/private, dengan metadata serta checksum dalam Firestore. Preview/unduh memakai endpoint backend terautentikasi.

### Database cloud dan layanan lokal

Login milik aplikasi berjalan di backend Node.js. Akun pemilik dibuat melalui proses bootstrap lokal, dengan password hash memakai scrypt dan salt acak. Simpan record akun dan hash token sesi sebagai data Firestore. Cookie sesi acak memakai HttpOnly, SameSite=Strict, rotasi saat login, batas kedaluwarsa, serta pencabutan saat logout. Backend memeriksa expiry pada setiap request. Untuk HTTP localhost, kebijakan cookie mengikuti mode development, dan atribut Secure diaktifkan ketika menggunakan HTTPS. Mutasi memakai validasi Origin dan token CSRF, sedangkan login memakai pembatasan percobaan. Identitas owner diturunkan dari sesi server.

Backend memakai Admin SDK hanya untuk Cloud Firestore. Akses server menggunakan IAM dan melewati Security Rules, sehingga setiap operasi bisnis memerlukan pemeriksaan owner pada backend. Rules menolak semua akses client langsung. Credential tersedia pada proses server. [Admin SDK](https://firebase.google.com/docs/admin/setup), [IAM](https://firebase.google.com/docs/firestore/security/iam), [Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).

Nomor dan delivery dedupe memakai dokumen ber-ID deterministik dalam transaksi. SDK dapat mengulang callback transaksi saat konflik. Render, penulisan file, inference dan kirim WhatsApp dilakukan setelah commit. Simpan snapshot dalam batas ukuran dokumen dan gunakan index untuk query antrean. [Transaksi](https://firebase.google.com/docs/firestore/manage-data/transactions), [Model dokumen](https://firebase.google.com/docs/firestore/data-model).

File privat disimpan pada disk lokal di luar folder publik. Gunakan file ID, path tervalidasi, checksum, temporary write serta atomic rename. Revisi ready hanya sah setelah file tersedia. Cadangkan file beserta metadata dengan manifest yang diuji restore. UI mendapat update melalui SSE backend setelah perubahan database. [Firestore listener](https://firebase.google.com/docs/firestore/query-data/listen).

Project Firestore dan credential IAM dipilih ketika T05 dilaksanakan. Tinjau kuota read/write serta penggunaan listener sebelum menyetujui perubahan billing. [Biaya Firestore](https://firebase.google.com/docs/firestore/pricing).

## 9. Kebutuhan nonfungsional

- Mutasi keuangan, revisi, dan outbox tahan retry serta akses bersamaan.
- Secret disimpan server-side dan disaring dari log. Build browser diperiksa terhadap kebocoran credential.
- Login, API, upload, QR, file path, CLI argumen, dan tool agent mempunyai validasi pada batas masuk. Request mutasi memakai validasi Origin serta token CSRF.
- Keyboard, focus management, reduced motion, mobile, serta fallback HTML tersedia untuk fungsi inti.
- Target awal 45–60 FPS pada RTX 3050 dan sekurangnya 30 FPS pada mode hemat, dengan kondisi benchmark tercatat.
- Target payload scene awal di bawah 20 MB terkompresi, DPR maksimum awal 1,5, serta tekstur awal 1K.
- Target PDF normal kurang dari 5 detik setelah Chromium siap. Cold start diukur terpisah.
- Firestore listener backend dan SSE lokal memberi pembaruan. Reconnect membaca ulang snapshot agar UI memulihkan state yang benar.
- Health memisahkan backend, Firebase Cloud Firestore, Hermes, router model, renderer, dan WhatsApp.
- Backup mencakup database, file lokal privat, signature, konfigurasi, dan state runtime terkait. Restore diuji pada salinan terisolasi.
- Laptop mati atau sleep menghentikan eksekusi lokal. Jadwal tertunda mengikuti kebijakan review saat host aktif lagi.

## 10. Arah visual

Palet utama memakai navy `#101326`, panel `#1B2033`, cahaya hangat `#F2D29A`, serta aksen air `#388DA7`. Desktop menyediakan sekitar 65–75% area utama bagi kantor. Mobile menempatkan scene ringkas di atas dan membuka form pada layar penuh.

Model dan animasi memiliki lisensi tercatat. Gunakan konsep tersimpan sebagai panduan material, pencahayaan, denah, dan proporsi manusia. Kolam, kustomisasi lanjut, studio, gaming room, serta lantai tambahan masuk fase perluasan. [Konsep visual kantor](D:/portofolio/synectra-office/synectra-office-concept-v1.png).

## 11. Tahapan dan ukuran keberhasilan

| Tahap | Task | Hasil yang dibuktikan |
| --- | --- | --- |
| Fondasi | T01–T04 | Workspace berlapis, integrasi Hermes, PDF uji Baileys, serta prototype humanoid |
| Nota operasional | T05–T11 | Pemilik membuat nota bertanda tangan, memverifikasi ledger, dan mengirim PDF melalui outbox |
| Kantor 3D | T12–T15 | Empat humanoid, interaksi objek, serta idle yang mengikuti state bisnis |
| Agent dan otomasi | T16–T18 | Draft melalui Hermes, Kanban terisolasi, serta cron yang dapat dilacak |
| Penguatan dan rilis | T19–T22 | Receipt/persistence, akses aman, restore, performa, serta operasi harian terbukti |
| Perluasan | T23 | Kustomisasi serta area kantor tambahan sesuai budget render |
| Batas development | T24 | Akses loopback, koneksi Firestore server-side, file lokal dan pemulihan teruji |

Rilis lokal diterima setelah nomor nota concurrent unik, snapshot/PDF sesuai, payment benar, pengiriman ambigu ditangani, otorisasi owner backend dan IAM Firestore teruji, serta fungsi kantor dapat dipakai dengan keyboard dan fallback. T22 mengumpulkan bukti seluruh kriteria terkait.

## 12. Risiko dan keputusan terbuka

| Hal | Penanganan dan pemilik task |
| --- | --- |
| Baileys memakai protokol tidak resmi | T03/T19 menguji versi, logout, pairing, dan persistence, dengan risiko pembatasan akun dicatat |
| Receipt bridge belum terbukti | T11 menampilkan status berdasarkan bukti, T19 memverifikasi jalur receipt |
| Timeout sesudah kirim | T10/T20 memakai unknown dan rekonsiliasi sebelum kirim ulang |
| Biaya model aktual belum diketahui | T02/T16/T18 meninjau usage, kontrol operasional, dan budget sebelum otomatisasi |
| Konfigurasi gateway bersama | T02 memverifikasi nilai aktif serta dampak perubahan sebelum pemakaian berikutnya |
| Project Firebase Cloud Firestore, nama bisnis, signature | T05/T06/T09 memastikan input pemilik pada waktunya |
| Kualitas humanoid dan GPU | T04/T21 mengukur aset serta performa pada perangkat aktual |
| Batas development | T24 memverifikasi loopback, satu pemilik sesi dan pemulihan lokal |

Estimasi 14–25 hari kerja pada planning awal menjadi perkiraan agregat fase 0–4. Kalibrasikan memakai progres aktual. Perluasan visual dan validasi lingkungan lokal dikalibrasi berdasarkan hasil implementasi.

## 13. Sumber dan batas verifikasi dokumen

- Planning lokal menjadi spesifikasi detail serta sumber riset. [Planning](D:/portofolio/synectra-office/PLANNING_WEB_NOTA_KANTOR_3D.md).
- Catatan T01 dan T02 menjadi bukti historis pelaksanaan. [T01](D:/portofolio/synectra-office/T01.md), [T02](D:/portofolio/synectra-office/T02.md).
- Struktur source, UI pairing, route WhatsApp, service, serta tes adapter diperiksa untuk membedakan pekerjaan tersedia dan pekerjaan tersisa.

Penyusunan dokumen memakai pemeriksaan berkas. Pengujian runtime, penerimaan WhatsApp, serta benchmark menjadi bukti yang dikumpulkan pada task pelaksanaan.
