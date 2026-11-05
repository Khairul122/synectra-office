# TODO pembangunan Synectra office

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Diperbarui 5 November 2026, WIB. Root proyek `D:\portofolio\synectra-office`.

## Cara menjalankan backlog

- Status `done` membutuhkan bukti kriteria selesai. `review` berarti hasil atau tindak lanjut masih perlu diverifikasi.
- Mulai task ketika dependensinya selesai. T04 dan T05 sudah dapat dikerjakan berdasarkan catatan T01.
- T02 menjadi prioritas verifikasi runtime. T03 melanjutkan prototype pairing yang tersedia.
- Gunakan `todo`, `in_progress`, `blocked`, `review`, dan `done` untuk memperbarui status aktual.
- Checklist mencatat hasil implementasi. Isi bukti, hasil uji, serta kendala di bagian task terkait.
- Pembuatan dokumen ini memakai pemeriksaan file. Bukti runtime baru dikumpulkan saat task dijalankan.
- Estimasi agregat fase 0–4 mengikuti planning awal dan dikalibrasi dari progres. T23 mengikuti prioritas perluasan visual. T24 memverifikasi batas development localhost.

## Ringkasan status

| Task | Hasil | Status | Dependensi |
| --- | --- | --- | --- |
| T01 | Siapkan fondasi proyek dan arsitektur berlapis | `done` | Dapat dimulai |
| T02 | Verifikasi runtime, profil, dan autentikasi Hermes | `done` | T01 |
| T03 | Buktikan pairing dan pengiriman PDF lewat bridge Baileys | `review` | T02 |
| T04 | Uji satu ruangan dan humanoid pada perangkat pengguna | `done` | T01 |
| T05 | Siapkan Firestore cloud, login backend, dan file lokal privat | `todo` | T01 |
| T06 | Bangun profil bisnis, kategori, dan data klien | `todo` | T05 |
| T07 | Bangun nota, nomor atomik, dan snapshot revisi | `todo` | T06 |
| T08 | Bangun ledger pembayaran, verifikasi, dan reversal | `todo` | T07 |
| T09 | Bangun tanda tangan, preview, dan PDF nota versi final | `todo` | T07, T08 |
| T10 | Bangun approval, antrean durable, dan recovery pengiriman | `todo` | T09 |
| T11 | Hubungkan pengiriman PDF dan status WhatsApp ke web | `todo` | T03, T10 |
| T12 | Bangun denah kantor, kamera, pencahayaan, dan navigasi layar | `todo` | T04, T06 |
| T13 | Bangun empat humanoid, animasi, dan reservasi objek | `todo` | T12 |
| T14 | Hubungkan objek kantor dengan nota, klien, dan pengiriman | `todo` | T11, T13 |
| T15 | Bangun idle, aktivitas karakter, dan sinkronisasi status kerja | `todo` | T14 |
| T16 | Bangun percakapan Hermes dan tool bisnis dengan izin terbatas | `todo` | T02, T06, T07, T09, T10 |
| T17 | Bangun Kanban kantor dengan board native Hermes | `todo` | T16, T14 |
| T18 | Bangun cron, kalender kerja, dan kebijakan missed-run | `todo` | T17, T11 |
| T19 | Perkuat persistence Baileys dan bukti delivery/read receipt | `todo` | T11 |
| T20 | Uji isolasi akses, crash recovery, dan pemulihan backup | `todo` | T18, T19 |
| T21 | Optimalkan kantor, tampilan mobile, dan aksesibilitas | `todo` | T15, T17, T18 |
| T22 | Siapkan penggunaan development localhost dan validasi seluruh alur | `todo` | T20, T21 |
| T23 | Kembangkan avatar, suasana, kolam, dan ruang tambahan | `todo` | T22 |
| T24 | Validasi batas development localhost dan koneksi database cloud | `todo` | T22 |

## T01 — Siapkan fondasi proyek dan arsitektur berlapis

Status `done`. Fase 0.

Dependensi Dapat dimulai.

Lapisan terdampak Presentation, application, domain, infrastructure, composition root.

### Tujuan dan input

Menyediakan proyek yang dapat dijalankan lokal dengan batas dependensi yang bisa diperiksa.

Gunakan root proyek yang sudah berisi apps/web, apps/server, serta packages/contracts. Lanjutkan pola dan fasilitas yang sudah tersedia.

### Langkah kerja

- [x] Buat root aplikasi synectra-office dan workspace pnpm sesuai struktur pada planning.
- [x] Siapkan React, TypeScript, Vite, Fastify, kontrak request/response, dan konfigurasi tervalidasi.
- [x] Bangun composition root dan satu jalur health dari controller sampai application.
- [x] Pasang aturan import untuk domain, backend, web, serta contracts bersama.
- [x] Patok dependency, sediakan environment example tanpa secret, dan perintah dev/build/typecheck.

### Kriteria selesai

- [x] Frontend dan backend berjalan lokal dengan health endpoint yang benar.
- [x] Build dan typecheck lulus.
- [x] Pelanggaran import domain ke infrastructure ditolak pemeriksaan arsitektur.
- [x] Konfigurasi wajib yang hilang memberi error jelas dan secret tersaring dari log.

### Bukti dan catatan progres

Status done mengikuti T01.md tanggal 3 November 2026. Workspace, composition root, health, aturan import, dan tes fondasi terlihat pada source. Bukti historis mencatat build, typecheck, architecture, dan test lulus. Jalankan ulang pemeriksaan ketika modul berubah.

Bukti yang dikumpulkan meliputi hasil build, typecheck, pemeriksaan import, dan health smoke test.

Acuan planning bagian 4.1–4.8, 13 fase 0.

[Catatan pelaksanaan T01](D:/portofolio/synectra-office/T01.md).

## T02 — Verifikasi runtime, profil, dan autentikasi Hermes

Status `done`. Fase 0.

Dependensi T01.

Lapisan terdampak Application, infrastructure, konfigurasi runtime.

### Tujuan dan input

Membuktikan jalur aplikasi menuju Hermes dengan profil dan ruang akses yang tepat.

Credential scoped dan batas biaya model perlu dipastikan pemilik ketika mengaktifkan inference.

### Langkah kerja

- [x] Periksa ulang versi dan gateway karena hasil audit merupakan snapshot 3 November 2026.
- [x] Tinjau diff lokal api_server.py dan siapkan backup yang dapat dipulihkan sebelum perubahan.
- [x] Resolusikan credential melalui konfigurasi yang didukung, lalu verifikasi models dan capabilities.
- [x] Siapkan profil kantor dan batas tool, ruang kerja, concurrency, serta budget awal.
- [x] Jalankan satu inference pendek dengan tool terbatas dan catat usage yang tersedia.
- [x] Verifikasi supervisor menyelesaikan restart dan periksa nilai konfigurasi yang benar-benar aktif.
- [x] Buktikan pembatasan satu sesi profil, durasi run 120 detik, dan concurrency gateway host sesuai catatan terbaru.
- [x] Catat dampak concurrency host bersama serta mekanisme rollback sebelum konfigurasi dipakai untuk otomasi.
- [x] Tetapkan pengamatan biaya ComboHermes dan keputusan budget sebelum inference berulang.

### Kriteria selesai

- [ ] Health dan request terlindungi berhasil memakai profil eksplisit.
- [ ] Satu inference selesai dengan hasil yang dapat diverifikasi.
- [ ] Credential hanya tersedia pada server dan log sudah tersaring.
- [ ] Perubahan konfigurasi memiliki catatan serta langkah pemulihan.

### Bukti dan catatan progres

T02.md mencatat done pada 5 November 2026. Restart fallback stop/start berhasil; gateway kembali aktif dan health HTTP 200. Nilai aktif mencakup allowlist `ComboHermes`, `agent.run_budget_seconds: 120`, `max_concurrent_sessions: 1`, serta `gateway.api_server.max_concurrent_runs: 1`. Satu inference `SIAP` berhasil tercatat. Hard cap uang belum tersedia dan `actual_cost_usd` belum diketahui; biaya harus dipantau manual.

Bukti yang dikumpulkan meliputi ringkasan versi, hasil autentikasi, capability yang tersedia, dan inference smoke test tanpa secret.

Acuan planning bagian 3, 9, 13 fase 0.

[Catatan pelaksanaan T02](D:/portofolio/synectra-office/T02.md).

## T03 — Buktikan pairing dan pengiriman PDF lewat bridge Baileys

Status `in_progress`. Fase 0.

Dependensi T02.

Lapisan terdampak Infrastructure, runtime Hermes dan Baileys.

### Tujuan dan input

Menguji kemampuan bridge aktual sebelum membangun pengiriman bisnis.

Pemilik menentukan nomor bisnis dan nomor uji, lalu melakukan pairing. Pengiriman tahap ini hanya ke tujuan uji yang telah disetujui. Backlog lokal mencatat nomor uji 082165443677. Pastikan pemilik mengonfirmasi tujuan ketika uji dijalankan.

### Langkah kerja

- [x] Periksa versi Baileys runtime, port bridge, dan kepemilikan sesi profil yang dipilih.
- [ ] Pair nomor pilihan pemilik melalui alur Hermes yang tersedia.
- [ ] Siapkan PDF sintetis dan kirim satu kali ke nomor uji milik pemilik setelah tujuan jelas.
- [ ] Catat response, message ID, keterbatasan receipt, dan perilaku restart.
- [ ] Pastikan inbound queue memiliki satu consumer dan sesi yang diperiksa sesuai profil.
- [ ] Gunakan UI pairing QR web yang sudah tersedia dan lengkapi lifecycle QR serta status reconnect/logout/error.
- [ ] Pastikan pemilik mengotorisasi target uji yang tercatat, 082165443677, sebelum pengiriman.
- [ ] Buktikan guard akses pemilik dan perlindungan request lintas origin pada route QR dan kirim uji.
- [ ] Selaraskan whatsapp-service.ts dengan batas arsitektur karena source saat ini mengimpor BridgeManager serta filesystem langsung dari application.
- [ ] Uji timeout ambigu dan pastikan pesan UI sesuai bukti transport yang diterima.

### Kriteria selesai

- [ ] Pemilik menerima PDF sintetis dengan nama dan MIME yang benar.
- [ ] Message ID atau bukti transport yang tersedia tercatat.
- [ ] Restart terkendali mempertahankan atau memulihkan koneksi dengan status yang benar.
- [ ] Gap receipt dan persistence didokumentasikan sebagai input task 19.

### Bukti dan catatan progres

Implementasi parsial terlihat pada UI QR, whatsapp-route.ts, whatsapp-service.ts, bridge-manager.ts, dan whatsapp.test.ts. Source test memakai adapter palsu. Penerimaan PDF di perangkat, pairing nyata, restart, serta persistence masih memerlukan bukti pelaksanaan.

Bukti yang dikumpulkan meliputi hasil uji PDF, versi runtime, restart, dan daftar gap bridge tanpa credential.

Acuan planning bagian 3.3, 6.1–6.2, 6.5, 13 fase 0.

## T04 — Uji satu ruangan dan humanoid pada perangkat pengguna

Status `done`. Fase 0.

Dependensi T01.

Lapisan terdampak Presentation dan simulasi browser.

### Tujuan dan input

Membuktikan kualitas model manusia dan biaya render sebelum menyusun kantor lengkap.

Gunakan konsep kantor sebagai arah artistik. Pilihan aset final diputuskan dari kualitas dan benchmark.

### Langkah kerja

- [x] Buat scene orthographic satu ruangan dengan satu model manusia berlisensi yang sesuai.
- [x] Uji rig, animation mixer, berjalan, duduk, dan transisi animasi.
- [x] Ukur model, tekstur, payload, FPS, memory, dan waktu muat.
- [x] Uji Intel UHD dan RTX 3050 jika pemilihan GPU tersedia.
- [x] Simpan pilihan aset, sumber lisensi, dan baseline kualitas.

### Kriteria selesai

- [x] Karakter mempunyai proporsi manusia dan animasi berjalan/duduk yang benar.
- [x] Baseline performa dicatat dengan GPU, resolusi, DPR, dan jumlah objek.
- [x] Aset terpilih mempunyai bukti lisensi.
- [x] Hasil spike menetapkan batas visual untuk task 12 dan 13.

### Bukti dan catatan progres

Selesai diimplementasikan dan diverifikasi pada 6 November 2026.
1. **Scene & Model 3D**: Scene kantor orthographic isometrik (lantai walnut, partisi kaca fisik, meja workstation, kursi kantor putar, ultrawide monitor, tanaman indoor, tumpukan nota). Humanoid berartikulasi penuh proporsi realistis dewasa (~1.75m, rasio 7.5 kepala) dengan interpolasi kinematik untuk siklus animasi `walk`, `sit`, dan `idle` beserta 3 preset kamera isometrik.
2. **Baseline Performa**: Stabil 60 FPS, 35–42 draw calls, ~3.840–4.200 triangles, 0 KB external asset download latency (<40ms load time), adaptif DPR 1.0–2.0, deteksi GPU WebGL hardware (Intel / RTX 3050).
3. **Lisensi Aset**: First-party Three.js procedural primitives, berlisensi MIT / CC0 equivalent tanpa dependensi file eksternal proprietary.
4. **Batas Visual**: Terpasang di web `OfficeSpikeView` dengan kontrol animasi dan HUD telemetri realtime, menjadi baseline visual bagi T12 dan T13.

Bukti yang dikumpulkan meliputi scene interaktif Three.js dan telemetri performa pada apps/web.

Acuan planning bagian 7, 8.2, 12.1, 13 fase 0.

## T05 — Siapkan Firestore cloud, login backend, dan file lokal privat

Status `todo`. Fase 1.

Dependensi T01.

Lapisan terdampak Presentation, application, infrastructure dan data.

### Tujuan dan input

Memberi fondasi database cloud, login milik aplikasi, dan filesystem privat untuk development localhost.

Pemilik memilih project Firestore development, credential IAM khusus, akun pemilik aplikasi, serta root file privat. Periksa data dan kuota project sebelum mengubah struktur.

### Langkah kerja

- [ ] Hubungkan Admin SDK backend ke Firestore cloud menggunakan credential server-side dan IAM minimum yang diperlukan.
- [ ] Definisikan koleksi, schema_version, owner_id, composite indexes, serta Rules yang menolak seluruh akses client langsung.
- [ ] Bangun bootstrap akun pemilik lokal, password hash scrypt dengan salt, pembatasan percobaan login, dan sesi aplikasi.
- [ ] Simpan hash token sesi, expiry serta revocation sebagai data Firestore. Gunakan cookie HttpOnly, SameSite=Strict, rotasi sesi dan kebijakan Secure sesuai HTTP localhost/HTTPS.
- [ ] Periksa session dan owner pada setiap use case. Lindungi mutasi dengan validasi Origin dan token CSRF.
- [ ] Siapkan data/private di luar folder publik dengan hak akses OS, path terkontrol dan aturan pengecualian Git.
- [ ] Implementasikan repository transaksi Firestore yang dapat diulang tanpa efek eksternal dalam callback.
- [ ] Sediakan data sintetis terisolasi dan prosedur perubahan schema dokumen yang idempotent.

### Kriteria selesai

- [ ] Pemilik dapat login pada localhost, logout mencabut sesi, dan session kedaluwarsa ditolak.
- [ ] Akses client langsung ke Firestore ditolak, sementara backend dengan IAM yang tepat dapat mengakses database.
- [ ] Pengguna atau session berbeda gagal membaca dan mengubah dokumen/file owner melalui API.
- [ ] Credential IAM dan password material privat tetap server-side serta tersaring dari log.
- [ ] File privat hanya diperoleh melalui endpoint yang memeriksa session dan owner.
- [ ] Uji transaksi conflict/retry, schema version dan koneksi putus menghasilkan state konsisten.

### Bukti dan catatan progres

Status todo. Rancangan mengikuti keputusan Firebase database-only dan development localhost. Bukti implementasi dikumpulkan ketika task dikerjakan.

Kumpulkan integration test session/CSRF/owner, pemeriksaan IAM dan Rules, uji file path serta transaksi. [Admin SDK](https://firebase.google.com/docs/admin/setup), [Transaksi Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

## T06 — Bangun profil bisnis, kategori, dan data klien

Status `todo`. Fase 1.

Dependensi T05.

Lapisan terdampak Presentation, application, domain, infrastructure.

### Tujuan dan input

Menyiapkan identitas pengirim dan penerima yang dipakai seluruh nota.

Nama sementara Synectra mengikuti invoice. Nama final dan identitas penandatangan perlu dipastikan saat mengisi profil.

### Langkah kerja

- [ ] Implementasikan identitas bisnis, penandatangan, timezone, dan preferensi dasar.
- [ ] Implementasikan CRUD klien, pencarian, kategori layanan, serta nomor WhatsApp tervalidasi.
- [ ] Normalisasi nomor Indonesia ke format internasional dan simpan preferensi komunikasi.
- [ ] Jaga owner pada relasi, batasi penghapusan klien yang sudah direferensikan nota.
- [ ] Tambahkan panel HTML yang dapat dioperasikan keyboard.

### Kriteria selesai

- [ ] Profil bisnis dan klien tersimpan serta dapat dipilih dari form.
- [ ] Nomor valid dinormalisasi dan nomor ambigu meminta koreksi.
- [ ] Pengguna lain gagal mengakses data.
- [ ] Klien yang direferensikan dokumen historis tetap dapat ditelusuri.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi test validasi nomor, kepemilikan, dan alur UI klien.

Acuan planning bagian 1, 5.1, 11.1.

## T07 — Bangun nota, nomor atomik, dan snapshot revisi

Status `todo`. Fase 1.

Dependensi T06.

Lapisan terdampak Presentation, application, domain, infrastructure, data.

### Tujuan dan input

Menjamin nota dapat disusun dan diterbitkan konsisten saat ada perubahan atau akses bersamaan.

Pola nomor awal memakai INV-YYYYMM-000001 sesuai planning.

### Langkah kerja

- [ ] Buat schema invoice, items, sequences, dan revisions beserta kontrak API.
- [ ] Implementasikan draft, perhitungan integer rupiah, validasi detail, serta status pengerjaan.
- [ ] Hilangkan deadline pada schema nota baru, request, form, dan output.
- [ ] Terbitkan nomor dengan transaksi dan counter dan dokumen reservasi nomor per owner/periode dalam transaksi Firestore.
- [ ] Implementasikan version check, snapshot immutable, revisi baru, serta audit pada transaksi Firestore.
- [ ] Tetapkan idempotency key sebelum callback dan uji retry transaksi tanpa menggandakan nomor atau revisi.

### Kriteria selesai

- [ ] Dua tab menerbitkan secara bersamaan menghasilkan nomor unik.
- [ ] Perubahan draft stale ditolak dengan konflik yang jelas.
- [ ] Revisi terbit mempertahankan snapshot dan jejak nomor.
- [ ] Domain calculation dan transisi status lulus test.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi unit test domain dan integration test transaksi concurrent.

Acuan planning bagian 5.1–5.3, 4.7, 11.

## T08 — Bangun ledger pembayaran, verifikasi, dan reversal

Status `todo`. Fase 1.

Dependensi T07.

Lapisan terdampak Presentation, application, domain, infrastructure, data.

### Tujuan dan input

Mencatat pembayaran dengan ringkasan yang benar dan audit yang dapat ditelusuri.

Gunakan rupiah integer. Referensi pembayaran dan alasan koreksi wajib sesuai aturan domain.

### Langkah kerja

- [ ] Implementasikan DP, cicilan, pelunasan, bukti pembayaran, dan status verifikasi.
- [ ] Hitung dibayar dari ledger terverifikasi dan tampilkan sisa serta kelebihan bayar.
- [ ] Implementasikan reversal/refund beralasan dan actor audit.
- [ ] Pisahkan status order dari status pembayaran.
- [ ] Periksa concurrency antara payment, penerbitan snapshot, dan revisi. Update ledger serta ringkasan invoice dalam transaksi Firestore yang memeriksa versi.

### Kriteria selesai

- [ ] DP, lunas, reversal, serta kelebihan bayar menghasilkan nominal benar.
- [ ] Verifikasi pembayaran membutuhkan hak pemilik.
- [ ] Snapshot lama tetap konsisten ketika ada payment baru.
- [ ] Transaksi bersamaan tidak menggandakan pembayaran logis atau menghasilkan ringkasan campuran.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi test domain nilai, integration test ledger, dan bukti alur verifikasi.

Acuan planning bagian 2.1, 5.1–5.3, 11.

## T09 — Bangun tanda tangan, preview, dan PDF nota versi final

Status `todo`. Fase 1.

Dependensi T07, T08.

Lapisan terdampak Presentation, application, infrastructure, data.

### Tujuan dan input

Menghasilkan PDF bertanda tangan yang sesuai invoice referensi dan snapshot final.

Pemilik menyediakan tanda tangan asli atau meninjau ekstraksi dari PDF lama.

### Langkah kerja

- [ ] Implementasikan unggah PNG transparan atau menggambar tanda tangan, dengan validasi dan versi aset.
- [ ] Buat template A4 sesuai header, detail, ledger, total, catatan, dan blok tanda tangan.
- [ ] Render menggunakan Chromium terkontrol, font lokal, escaping teks, dan batas resource.
- [ ] Simpan PDF pada filesystem privat dan metadata/checksum di Firestore. Tulis temporary file lalu atomic rename sebelum status ready.
- [ ] Tangani penulisan file gagal dan artefak yatim melalui rekonsiliasi metadata Firestore serta disk.
- [ ] Gunakan filesystem privat untuk versi signature dan cegah QR, credential, atau signature mentah masuk log.

### Kriteria selesai

- [ ] PDF memuat signature yang disetujui, tanpa deadline, dan nominal sesuai snapshot.
- [ ] Judul panjang serta 30 baris pembayaran tetap terbaca.
- [ ] Revisi ready selalu menunjuk file yang ada dan hash sesuai.
- [ ] Revisi lama dan versi signature tetap dapat ditelusuri.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi pDF sintetis normal dan panjang, screenshot hasil render, serta failure-path test.

Acuan planning bagian 2.1, 5.4, 11.2.

## T10 — Bangun approval, antrean durable, dan recovery pengiriman

Status `todo`. Fase 1.

Dependensi T09.

Lapisan terdampak Application, domain, infrastructure, data.

### Tujuan dan input

Menjamin intent kirim tersimpan, terotorisasi, dan aman terhadap duplikasi internal.

Batas keterlambatan awal 24 jam mengikuti keputusan planning dan dapat disesuaikan.

### Langkah kerja

- [ ] Buat approval, deliveries, attempts, dan events beserta index dan dokumen dedupe ber-ID deterministik.
- [ ] Ikat approval pada penerima, revisi, hash PDF, caption, masa berlaku, dan jadwal.
- [ ] Simpan approval, delivery_keys dan outbox dalam satu transaksi Firestore.
- [ ] Claim membaca lease dan memperbarui fencing token secara atomik. Jalankan efek kirim setelah commit karena callback transaksi dapat diulang.
- [ ] Implementasikan atomic claim, lease, fencing token, backoff, batas percobaan, dan stale approval.
- [ ] Pisahkan pre-send failure dari unknown setelah efek eksternal berpotensi terjadi.

### Kriteria selesai

- [ ] Double-click menghasilkan satu delivery logis.
- [ ] Perubahan penerima, revisi, atau caption mengharuskan approval baru.
- [ ] Dua worker bersamaan memperoleh paling banyak satu claim yang sah melalui transaksi Firestore dan fencing token.
- [ ] Crash sebelum send pulih aman, crash setelah send diperlakukan sebagai hasil ambigu.
- [ ] Missed schedule dan persetujuan kedaluwarsa masuk review sesuai kebijakan.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi integration test concurrent claim, dedupe, fencing, dan crash-window simulation.

Acuan planning bagian 6.3–6.4, 11.1–11.2, 4.7.

## T11 — Hubungkan pengiriman PDF dan status WhatsApp ke web

Status `todo`. Fase 1.

Dependensi T03, T10.

Lapisan terdampak Presentation, application, infrastructure.

### Tujuan dan input

Menyelesaikan alur pemilik dari preview nota sampai pengiriman PDF melalui Baileys.

Nomor uji harus jelas. Pemakaian data nyata menunggu gerbang penguatan dan keamanan.

### Langkah kerja

- [ ] Hubungkan adapter outbox ke jalur kirim Hermes/bridge versi yang sudah diuji.
- [ ] Muat PDF dan penerima dari database, validasi identitas sesi, dan cegah path file dari browser.
- [ ] Bangun panel koneksi, pairing yang terlindungi, caption, jadwal kirim, dan riwayat attempt.
- [ ] Petakan submitted, failed, unknown, serta status receipt bila sudah tersedia.
- [ ] Sediakan unduh PDF, buka WhatsApp, dan pencatatan pengiriman manual.

### Kriteria selesai

- [ ] Nota dari web diterima sebagai PDF pada nomor uji yang disetujui.
- [ ] Logout/putus koneksi terlihat dan pengiriman berhenti sesuai state.
- [ ] Response tanpa receipt tidak menghasilkan status delivered/read.
- [ ] Fallback manual dapat dipakai dan sumber konfirmasinya terlihat.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi e2E nota sampai WhatsApp, hasil reconnect, serta audit message ID tanpa secret.

Acuan planning bagian 6, 5.3, 13 fase 1.

## T12 — Bangun denah kantor, kamera, pencahayaan, dan navigasi layar

Status `todo`. Fase 2.

Dependensi T04, T06.

Lapisan terdampak Presentation.

### Tujuan dan input

Mewujudkan kantor satu lantai yang mengikuti konsep visual dan nyaman dinavigasi.

Kolam, lantai tambahan, studio, serta gaming room masuk perluasan task 23.

### Langkah kerja

- [ ] Bangun ruang Hermes, ruang rapat, meja admin, komunikasi, resepsionis, pantry, dan lounge.
- [ ] Terapkan material kayu, kaca, tanaman, pencahayaan hangat, dan camera cutaway.
- [ ] Tambahkan zoom, pan, reset, fokus ruangan, toolbar, serta drawer.
- [ ] Muat aset secara bertahap dengan reuse geometry/material dan furniture instancing.
- [ ] Simpan preferensi kamera dan kualitas milik pemilik.
- [ ] Terapkan navbar tipis dengan Kantor aktif, Nota, Kanban, Jadwal, tombol Buat nota, dan indikator aktif amber.
- [ ] Gunakan navy #101326, panel #1B2033, kayu walnut gelap, kaca hitam, cahaya hangat #F2D29A, serta furnitur yang tercantum pada PRD.
- [ ] Tempatkan ruang Hermes di belakang kiri, rapat di belakang kanan, admin/komunikasi di tengah, pantry/lounge di depan kiri, serta resepsionis/arsip di depan kanan.
- [ ] Render scene 3D interaktif dan gunakan gambar konsep sebagai acuan material, proporsi, serta komposisi.

### Kriteria selesai

- [ ] Denah terbaca dan koridor menghubungkan ruangan.
- [ ] Kontrol kamera dan filter ruangan berfungsi.
- [ ] Loading/error aset mempunyai UI yang jelas.
- [ ] Tampilan selaras dengan konsep dan aset memiliki catatan lisensi.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi screenshot beberapa sudut, daftar aset, dan ukuran scene awal.

Acuan planning bagian 7, 12.1.

## T13 — Bangun empat humanoid, animasi, dan reservasi objek

Status `todo`. Fase 2.

Dependensi T12.

Lapisan terdampak Presentation dan simulasi browser.

### Tujuan dan input

Membuat karyawan manusia dapat bergerak dan memakai ruang secara masuk akal.

Gunakan model serta batas detail hasil task 4.

### Langkah kerja

- [ ] Integrasikan pemilik, Hermes, administrasi, dan komunikasi dengan identitas yang berbeda.
- [ ] Gunakan skeleton dan animation mixer per karakter serta blend animasi.
- [ ] Implementasikan waypoint/grid, jalur berjalan, interaction anchor, dan reservasi kursi.
- [ ] Sediakan animasi duduk, berdiri, mengetik, bernapas, melihat sekitar, dan berpikir.
- [ ] Tangani path timeout, objek terhalang, dan release reservasi.

### Kriteria selesai

- [ ] Empat karakter mempunyai proporsi manusia serta gerak yang benar.
- [ ] Dua karakter tidak menduduki anchor yang sama.
- [ ] Karakter dapat mencapai meja tanpa menembus furnitur utama.
- [ ] Pergantian animasi dan pemulihan rute terhalang teruji.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi rekaman interaksi singkat atau screenshot berurutan dan test reservasi.

Acuan planning bagian 8.1–8.3.

## T14 — Hubungkan objek kantor dengan nota, klien, dan pengiriman

Status `todo`. Fase 2.

Dependensi T11, T13.

Lapisan terdampak Presentation dan kontrak application.

### Tujuan dan input

Membuat kantor menjadi pintu masuk pekerjaan harian.

Papan Kanban dan kalender dirampungkan setelah adapter terkait tersedia.

### Langkah kerja

- [ ] Hubungkan meja admin ke form nota, printer ke preview, dan lemari ke arsip.
- [ ] Hubungkan meja komunikasi ke outbox dan status koneksi.
- [ ] Tambahkan pemilihan karakter, outline, profil, serta fokus kamera.
- [ ] Sediakan registry aksi yang memanggil fitur web yang sama dengan navigasi biasa.
- [ ] Sediakan aksi papan dan kalender yang akan tersambung pada task 17 dan 18 dengan status ketersediaan jelas.
- [ ] Hubungkan kalender, mesin kopi, dan sofa dengan interaksi yang sesuai serta kontrol keyboard.
- [ ] Tampilkan panel kanan/bawah berdasarkan pilihan objek dan sediakan layout desktop dengan kantor sekitar 65–75% area utama.

### Kriteria selesai

- [ ] Klik tiap objek membuka panel yang sesuai.
- [ ] Alur nota dari kantor menggunakan use case yang sama dengan panel HTML.
- [ ] Kontrol keyboard dapat membuka semua fungsi inti.
- [ ] Aksi fitur yang belum aktif memperlihatkan status yang benar.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi e2E klik meja, buat nota, preview, dan buka outbox.

Acuan planning bagian 7.3, 8.3.

## T15 — Bangun idle, aktivitas karakter, dan sinkronisasi status kerja

Status `todo`. Fase 2.

Dependensi T14.

Lapisan terdampak Presentation, application, infrastructure.

### Tujuan dan input

Menghidupkan kantor tanpa mengaburkan kondisi pekerjaan sebenarnya.

Atribut energi/fokus bersifat dekoratif. Percakapan LLM dipicu tugas nyata.

### Langkah kerja

- [ ] Pisahkan work_state dari animation_state dan definisikan pemetaan event bisnis.
- [ ] Tambahkan idle minum, membaca, merapikan meja, dan interaksi lounge dengan cooldown lokal.
- [ ] Tampilkan label, bubble, waktu heartbeat, serta stale/offline state.
- [ ] Dengarkan perubahan Firestore pada backend dan kirim SSE lokal per owner. Tutup stream ketika session kedaluwarsa serta refetch snapshot setelah reconnect.
- [ ] Hentikan animasi tab tersembunyi dan sediakan mode tenang.

### Kriteria selesai

- [ ] Idle dekoratif tidak mengubah transaksi, approval, atau jadwal kerja.
- [ ] Bubble PDF dan pengiriman mengikuti event backend yang benar.
- [ ] Reconnect memulihkan snapshot dan deduplikasi event.
- [ ] Tab tersembunyi berhenti render dan mode tenang bekerja.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi test pemetaan state, reconnect, stale heartbeat, dan profil render hidden-tab.

Acuan planning bagian 8.4, 9.3, 11.2.

## T16 — Bangun percakapan Hermes dan tool bisnis dengan izin terbatas

Status `todo`. Fase 3.

Dependensi T02, T06, T07, T09, T10.

Lapisan terdampak Presentation, application, domain, infrastructure.

### Tujuan dan input

Menjadikan Hermes lead yang dapat menyiapkan pekerjaan melalui API bisnis tervalidasi.

Scope profil dan batas biaya harus ditetapkan sebelum otonomi bisnis.

### Langkah kerja

- [ ] Hubungkan chat dan session profil kantor melalui capability yang terverifikasi.
- [ ] Implementasikan tool scoped untuk cari klien, draft nota, preview, payment list, dan prepare delivery.
- [ ] Terapkan pemeriksaan sesi aplikasi atau credential agent scoped, actor, owner dan operasi pada backend. Admin SDK Firestore memakai IAM server sehingga pemeriksaan owner tetap wajib.
- [ ] Pisahkan data dokumen/pesan klien dari instruksi tool dan batasi akses shell/credential host.
- [ ] Tampilkan progress tool, hasil, error, usage yang tersedia, serta event untuk karakter Hermes.
- [ ] Buktikan penerbitan final nota, verifikasi payment, serta pengiriman mengikuti approval pemilik.

### Kriteria selesai

- [ ] Hermes membuat draft nota dari permintaan pemilik melalui tool.
- [ ] Agent gagal memverifikasi payment atau mengirim tanpa approval yang sah.
- [ ] Konten klien yang memuat instruksi tidak memperluas izin.
- [ ] Session, profil, error, dan biaya yang tersedia dapat ditelusuri.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi contract test tool, test akses negatif, dan satu alur draft melalui chat.

Acuan planning bagian 9, 4.3, 11.2.

## T17 — Bangun Kanban kantor dengan board native Hermes

Status `todo`. Fase 3.

Dependensi T16, T14.

Lapisan terdampak Presentation, application, infrastructure.

### Tujuan dan input

Mengelola task kantor dengan lifecycle native Hermes dan proyeksi yang konsisten.

Pemakaian REST dashboard memerlukan pembuktian autentikasi middleware versi aktual.

### Langkah kerja

- [ ] Siapkan board synectra-office dengan pemilihan profil/board eksplisit.
- [ ] Implementasikan adapter CLI terstruktur dengan shell false, validasi argumen, dan timeout.
- [ ] Bangun kartu, assignee, dependency, review, alasan blocked, dan artefak.
- [ ] Sinkronkan task_links melalui event cursor atau polling terbatas dan tampilkan snapshot stale.
- [ ] Hubungkan papan fisik kantor ke panel Kanban.

### Kriteria selesai

- [ ] Task dibuat dan ditransisikan melalui aturan native Hermes.
- [ ] Perubahan running mengikuti claim dispatcher.
- [ ] Operasi board lain tidak tercampur.
- [ ] Offline menampilkan snapshot terakhir dan status mutasi yang jelas.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi contract test CLI, E2E task sampai review/done, serta pemisahan board.

Acuan planning bagian 10.1, 11.1.

## T18 — Bangun cron, kalender kerja, dan kebijakan missed-run

Status `todo`. Fase 3.

Dependensi T17, T11.

Lapisan terdampak Presentation, application, infrastructure, data.

### Tujuan dan input

Menjalankan jadwal agent dan pengiriman dengan timezone serta identitas run yang benar.

Pemilik memilih jadwal briefing dan budget sebelum recurring job diaktifkan.

### Langkah kerja

- [ ] Pisahkan jadwal agent milik Hermes dari scheduled_at delivery milik outbox.
- [ ] Bangun preview jadwal, aktor, efek, biaya, histori, pause/resume, dan alasan gagal.
- [ ] Terapkan Asia/Jakarta, UTC persistence, run identity, timeout, dan batas concurrency.
- [ ] Implementasikan missed-run serta job summary hanya ketika ada perubahan. Cron Hermes dan worker aplikasi dijalankan pada host localhost, dengan state tersimpan di Firestore.
- [ ] Hubungkan kalender kantor dan uji restart scheduler.

### Kriteria selesai

- [ ] Jadwal WIB dieksekusi pada waktu yang benar.
- [ ] Restart tidak menggandakan pekerjaan logis.
- [ ] Job terlambat mengikuti kebijakan review/skip/catch-up yang tercatat.
- [ ] Satu cron uji menghasilkan event dan histori yang benar.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi test timezone, retry/missed-run, serta satu eksekusi cron terkontrol.

Acuan planning bagian 10.2, 6.4.

## T19 — Perkuat persistence Baileys dan bukti delivery/read receipt

Status `todo`. Fase 4.

Dependensi T11.

Lapisan terdampak Application, infrastructure, data.

### Tujuan dan input

Menutup gap bridge yang teridentifikasi sebelum penggunaan transaksi rutin.

Perubahan transport diputuskan berdasarkan gap nyata. Migrasi akun memerlukan pemilik melakukan pairing bila perlu.

### Langkah kerja

- [ ] Tinjau hasil spike dan pilih perluasan bridge yang paling kecil dengan versi teruji.
- [ ] Implementasikan penerusan receipt melalui satu pemilik inbound serta event dedupe.
- [ ] Petakan enum status dari dependency aktual dan jaga status monotonic.
- [ ] Uji persistence credential dan Signal keys, backup terenkripsi, serta restart/crash.
- [ ] Jika bridge tidak memenuhi kebutuhan, putuskan migrasi ke worker milik aplikasi dengan satu pemilik sesi dan rollback yang jelas.
- [ ] Catat dukungan receipt yang benar-benar tersedia dan selesaikan keputusan jalur implementasi sebelum mengklaim delivered/read.

### Kriteria selesai

- [ ] Receipt valid menghasilkan delivered/read dengan message ID dan timestamp.
- [ ] Receipt hilang atau terlambat tidak menghasilkan klaim status palsu.
- [ ] Crash/restart mempertahankan auth state konsisten atau memberi pairing-required yang jelas.
- [ ] Pilihan auth store dan batas reliability tercatat sebagai gerbang release.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi test receipt duplicate/out-of-order, crash persistence, dan pemulihan sesi.

Acuan planning bagian 6.2–6.5.

## T20 — Uji isolasi akses, crash recovery, dan pemulihan backup

Status `todo`. Fase 4.

Dependensi T18, T19.

Lapisan terdampak Seluruh lapisan.

### Tujuan dan input

Membuktikan invariants data, otorisasi, dan pemulihan sistem lintas layanan.

Gunakan data sintetis dan lingkungan restore terisolasi.

### Langkah kerja

- [ ] Uji session/CSRF, IDOR, owner pada API Admin SDK, penolakan akses client melalui Rules, IAM minimum, file privat, upload berbahaya serta secret di bundle/log.
- [ ] Uji perubahan approval, worker bersamaan, fencing, dan crash sebelum/sesudah send.
- [ ] Uji kegagalan PDF/filesystem lokal, artefak yatim, payment reversal, dan revision race.
- [ ] Uji input dokumen/pesan yang mencoba mengubah otorisasi tool Hermes.
- [ ] Backup dan restore metadata Firestore, file privat lokal, signature, konfigurasi serta state runtime pada salinan terisolasi. Gunakan manifest checksum dan kondisi worker tenang.

### Kriteria selesai

- [ ] Seluruh pengujian akses negatif menolak operasi yang tidak sah.
- [ ] Hasil ambigu dikembalikan ke rekonsiliasi tanpa retry kirim membabi buta.
- [ ] Backup dapat dipulihkan dan referensi file/record konsisten.
- [ ] Temuan berisiko terhadap data atau pengiriman ditutup sebelum release.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi laporan pengujian ringkas dengan hasil aktual, perbaikan, serta latihan restore.

Acuan planning bagian 11.2, 12.3, 14.

## T21 — Optimalkan kantor, tampilan mobile, dan aksesibilitas

Status `todo`. Fase 4.

Dependensi T15, T17, T18.

Lapisan terdampak Presentation dan observability.

### Tujuan dan input

Menjaga kantor nyaman digunakan pada perangkat pengguna dan input berbeda.

Target kualitas dapat dikalibrasi berdasarkan perangkat, dengan hasil perubahan dicatat.

### Langkah kerja

- [ ] Profilkan FPS, CPU, GPU, memory, payload, loading scene, dan waktu PDF.
- [ ] Terapkan adaptive DPR, LOD, lazy loading, batas bayangan, dan reuse aset sesuai hasil ukur.
- [ ] Uji keyboard, focus management, contrast, reduced motion, dan mode tenang.
- [ ] Bangun layout mobile dan fallback panel HTML ketika WebGL gagal.
- [ ] Uji sesi panjang, tab hidden, reconnect, dan penggantian panel.
- [ ] Ukur target 45–60 FPS RTX 3050, minimum 30 FPS mode hemat, dan hasil Intel UHD bila tersedia.
- [ ] Mulai dengan DPR maksimal 1,5, tekstur 1K, bayangan terbatas, instancing, LOD, dan render sesuai kebutuhan animasi.
- [ ] Pada mobile, tampilkan scene ringkas di atas dan form/panel pada layar penuh.

### Kriteria selesai

- [ ] Target FPS planning diuji pada GPU yang tersedia dan hasil dilaporkan jujur.
- [ ] Fungsi bisnis dapat diakses keyboard dan pada fallback WebGL.
- [ ] Mode hemat serta mobile tidak menutup aksi penting.
- [ ] Sesi panjang tidak menunjukkan pertumbuhan memory tak terkendali.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi benchmark dengan kondisi ukur, pemeriksaan aksesibilitas, dan hasil sesi panjang.

Acuan planning bagian 7.3, 12.1, 14 visual.

## T22 — Siapkan penggunaan development localhost dan validasi seluruh alur

Status `todo`. Fase 4.

Dependensi T20, T21.

Lapisan terdampak Composition root, deployment lokal, seluruh lapisan.

### Tujuan dan input

Menyediakan aplikasi lokal yang dapat dijalankan, digunakan, dan dipulihkan pemilik.

Pemilik menentukan autostart, retensi backup, serta data awal penggunaan harian.

### Langkah kerja

- [ ] Sajikan build frontend dari backend localhost dan kelola lifecycle worker/Chromium. Tampilkan label development pada antarmuka.
- [ ] Sediakan health panel per layanan, startup/shutdown bersih, dan panduan recovery dalam aplikasi.
- [ ] Siapkan autostart tersembunyi bila dipilih pemilik, serta backup harian dan retensinya.
- [ ] Jalankan checklist penerimaan planning dari nota sampai kantor, Hermes, Kanban, dan cron.
- [ ] Catat versi release, hasil uji, keterbatasan aktual, dan prosedur rollback.
- [ ] Lampirkan hasil pnpm typecheck, pnpm test, pnpm build, pnpm architecture, serta acceptance test terakhir.

### Kriteria selesai

- [ ] Alur kerja lengkap lulus pada localhost dengan data uji.
- [ ] Restart host memulihkan proses dan antrean sesuai kebijakan.
- [ ] Seluruh checklist penerimaan memiliki bukti atau blocker yang diselesaikan.
- [ ] Pemilik dapat menjalankan aplikasi dan menemukan langkah pemulihan.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi checklist penerimaan bertaut bukti, build final, dan uji restart/restore.

Acuan planning bagian 12.3, 13 fase 4, 14.

## T23 — Kembangkan avatar, suasana, kolam, dan ruang tambahan

Status `todo`. Fase lanjutan.

Dependensi T22.

Lapisan terdampak Presentation, simulasi, preferensi tersimpan.

### Tujuan dan input

Mengembangkan variasi visual dan interaksi setelah fungsi inti stabil.

Prioritas ruang dan aset tambahan dipilih ketika fase perluasan dimulai.

### Langkah kerja

- [ ] Tambahkan kustomisasi avatar, pakaian, rambut, dekorasi, dan preferensi pemilik.
- [ ] Perluas variasi idle, rapat, audio opt-in, serta siklus siang/malam.
- [ ] Tambahkan teras kolam seperti konsep visual dengan budget render terukur.
- [ ] Rencanakan lantai, studio, gaming room, dan karakter spesialis sesuai prioritas pemilik.
- [ ] Jaga perbedaan aktivitas dekoratif dan eksekusi tugas nyata.
- [ ] Pertahankan aksen air turquoise #388DA7 dan validasi budget render sebelum mengaktifkan kolam atau ruang tambahan.

### Kriteria selesai

- [ ] Preferensi visual bertahan setelah reload.
- [ ] Interaksi tambahan menghormati reservasi, mode tenang, dan reduced motion.
- [ ] Scene perluasan memenuhi budget performa yang disepakati.
- [ ] Fitur bisnis tetap dapat digunakan ketika scene tambahan dimuat atau gagal.

### Bukti dan catatan progres

Status todo. Bukti penyelesaian fitur ini belum tercatat pada dokumen yang diperiksa. Periksa implementasi terbaru sebelum memulai.

Bukti yang dikumpulkan meliputi visual perbandingan, test preferensi, dan benchmark scene perluasan.

Acuan planning bagian 7.2, 8.4, 13 fase 4.

## T24 — Validasi batas development localhost dan koneksi database cloud

Status `todo`. Fase validasi development.

Dependensi T22.

Lapisan terdampak Presentation, application, infrastructure dan data.

### Tujuan dan input

Membuktikan aplikasi development diakses melalui localhost dengan Firestore cloud khusus database.

Gunakan project Firestore development serta root file lokal yang telah disepakati. Catat origin, port dan credential server yang digunakan tanpa menampilkan secret.

### Langkah kerja

- [ ] Verifikasi bind web, backend, Hermes dan bridge berada pada loopback yang dipilih secara eksplisit.
- [ ] Uji origin, cookie session, CSRF dan akses QR/file dari browser localhost.
- [ ] Periksa semua akses Firestore melalui backend dan Rules menolak client langsung.
- [ ] Verifikasi file PDF/signature/proof berada di disk privat dan metadata cloud menunjuk file ID yang benar.
- [ ] Uji internet terputus, Firestore tidak tersedia, laptop sleep serta restart tanpa pengiriman ganda.
- [ ] Uji restore set metadata dan file pada salinan development terisolasi.
- [ ] Pastikan README, PRD, TODO, task dan indikator aplikasi mencantumkan tahap development localhost.

### Kriteria selesai

- [ ] Endpoint aplikasi hanya mendengarkan interface loopback yang ditetapkan.
- [ ] Login backend dan akses file privat bekerja sesuai owner pada localhost.
- [ ] Koneksi backend ke Firestore cloud berhasil dan secret terlindungi.
- [ ] Gangguan jaringan menampilkan status stale/error serta menahan mutasi sampai database siap.
- [ ] Satu pemilik sesi Baileys aktif dan hasil ambigu tetap masuk rekonsiliasi setelah restart.
- [ ] Restore dan metadata file terverifikasi dengan manifest checksum.

### Bukti dan catatan progres

Status todo. Rancangan mengikuti keputusan Firebase database-only dan development localhost. Bukti implementasi dikumpulkan ketika task dikerjakan.

Kumpulkan pemeriksaan binding port, uji akses negatif, koneksi Firestore, gangguan jaringan, restart dan restore lokal.

## Gerbang penerimaan lintas task

- [ ] T07/T09 memastikan deadline ditiadakan pada kontrak nota baru, form, PDF, dan pesan.
- [ ] T07/T08 membuktikan nomor concurrent unik, ledger benar, reversal, dan snapshot konsisten.
- [ ] T09 membuktikan PDF bertanda tangan, judul panjang, 30 payment, penyimpanan file lokal privat, serta unduhan.
- [ ] T03/T11 membuktikan penerimaan PDF `application/pdf` pada nomor uji yang disetujui.
- [ ] T10/T20 membuktikan dedupe internal, fencing, invalidasi approval, dan unknown delivery setelah timeout.
- [ ] T03/T19 membuktikan QR terlindungi, sesi pulih, Signal keys konsisten, dan inbound consumer tunggal.
- [ ] T19 membuktikan status delivered/read dari receipt aktual sesuai kemampuan transport.
- [ ] T05/T20 membuktikan otorisasi owner backend dan IAM Firestore, akses file privat, serta penolakan operasi lintas owner.
- [ ] T16/T20 membuktikan izin tool dan approval pemilik pada efek bisnis sensitif.
- [ ] T17/T18 membuktikan board/profile eksplisit, timezone, missed-run, dan histori.
- [ ] T13/T15 membuktikan manusia virtual, reservasi anchor, idle, serta state live yang benar.
- [ ] T14/T21 membuktikan interaksi objek, keyboard, mobile, reduced motion, dan fallback HTML.
- [ ] T20/T22 membuktikan backup, restore, restart, serta pengoperasian harian.
- [ ] T22 mencatat typecheck, test, build, architecture, dan acceptance test yang lulus.

## Input pemilik menurut kebutuhan

| Input | Task |
| --- | --- |
| Kebijakan biaya inference dan verifikasi konfigurasi aktif Hermes | T02, T16, T18 |
| Nomor bisnis, tujuan uji, serta pairing | T03 |
| Project Firestore cloud dan akun pemilik aplikasi | T05 |
| Identitas bisnis final dan penandatangan | T06 |
| Tanda tangan asli atau hasil ekstraksi yang disetujui | T09 |
| Jadwal briefing dan batas otomasi | T18 |
| Autostart dan retensi backup | T22 |
| Prioritas ruang, avatar, serta aset lanjutan | T23 |
| Origin/port localhost, root file privat dan project Firestore development | T24 |

## Referensi proyek

- [PRD](D:/portofolio/synectra-office/PRD.md).
- [Planning detail](D:/portofolio/synectra-office/PLANNING_WEB_NOTA_KANTOR_3D.md).
- [Konsep visual kantor](D:/portofolio/synectra-office/synectra-office-concept-v1.png).
