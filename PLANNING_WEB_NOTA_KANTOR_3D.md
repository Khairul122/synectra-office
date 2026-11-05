# Planning web nota dengan kantor 3D, Baileys, Hermes, dan Firebase Cloud Firestore

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Disusun 3 November 2026 dan direvisi 5 November 2026, WIB. Dokumen ini menggabungkan kebutuhan pengguna, pemeriksaan Hermes lokal, pembacaan invoice, referensi visual, dan riset dokumentasi primer.

Revisi 3 November 2026 mengikuti permintaan arsitektur berlapis dan visualisasi kantor. Struktur aplikasi menggunakan modular monolith dengan lapisan presentation, application, domain, infrastructure, serta data dan external systems.

## 1. Arah produk dan keputusan utama

Bangun aplikasi pribadi untuk membuat nota bertanda tangan, mencatat pembayaran, dan mengirim PDF kepada klien melalui WhatsApp. Halaman utamanya berupa kantor isometrik 3D yang hidup. Hermes menjadi lead agent untuk membantu pekerjaan. Karyawan virtual mempunyai tampilan manusia, meja kerja, aktivitas, dan interaksi seperti simulasi kehidupan.

Keputusan yang sudah berasal dari pengguna

- Database memakai Cloud Firestore pada Firebase cloud, diakses hanya oleh backend lokal.
- Aplikasi masih development dan digunakan melalui localhost saja.
- Nota memuat nomor, tanggal, judul, kategori, deskripsi, dan tanda tangan.
- Field deadline dihapus dari formulir, PDF, pesan WhatsApp, serta kontrak data nota baru.
- Visual mengikuti suasana kantor pada gambar referensi.
- Hermes menjadi lead agent, dengan cron dan Kanban.
- Baileys menjadi pilihan utama WhatsApp, sesuai jawaban pengguna saat riset.
- Struktur web menggunakan multi-layered architecture dengan tanggung jawab dan dependensi antarlapisan yang eksplisit.

Keputusan rancangan yang masih dapat disesuaikan

- Nama kerja produk `Synectra office`, mengikuti merek pada invoice. Nama final dapat diganti.
- Awal penggunaan untuk satu pemilik dan satu nomor WhatsApp khusus bisnis.
- React, TypeScript, Vite, React Three Fiber, dan backend Node.js dipilih untuk menyatukan formulir, dunia 3D, dan Baileys.
- Firebase cloud digunakan hanya untuk database Firestore. Login serta sesi dikelola backend, file disimpan pada disk lokal. Internet dibutuhkan untuk database cloud, WhatsApp, dan provider model.
- Mulai dengan 4 karakter manusia dan satu lantai. Skala kantor bertambah setelah performa dan alur nota terbukti.
- Pengiriman pertama memerlukan tindakan pemilik pada preview final. Otomatisasi terjadwal memakai persetujuan yang terikat penerima dan versi PDF.
- Estimasi waktu dan anggaran pada dokumen ini adalah perkiraan perencanaan.

Urutan hasil yang dikejar

1. Nota yang benar dan dapat dikirim sebagai dokumen PDF.
2. Kantor 3D yang langsung dapat dipakai untuk mengakses pekerjaan tersebut.
3. Hermes yang benar-benar terhubung, membantu menyiapkan pekerjaan, dan melaporkan hasil.
4. Kanban dan cron yang tahan restart.
5. Interaksi simulasi kehidupan dan perluasan kantor.

## 2. Hasil pemeriksaan bahan pengguna

### 2.1 Invoice lama

PDF terdiri dari satu halaman. Struktur yang terlihat adalah merek SYNECTRA, nomor invoice, tanggal, status order, identitas klien, detail pesanan, riwayat pembayaran, ringkasan nominal, catatan, dan tanda tangan di kanan bawah.

Contoh memuat nomor `INV-202607-4CA6D6D5`, tanggal 20 Juli 2026, total Rp1.300.000, pembayaran Rp650.000, dan sisa Rp650.000. Status order `Completed` muncul ketika pembayaran masih sebagian. Karena itu status pengerjaan dan status pembayaran perlu menjadi dua atribut terpisah.

Tanda tangan tulisan tangan terlihat pada PDF. Untuk hasil akhir, sediakan unggah PNG transparan atau menggambar tanda tangan. Hasil ekstraksi dari PDF lama dapat dipakai setelah pemilik meninjau kualitas dan identitasnya. Simpan versi tanda tangan yang digunakan setiap nota.

Judul pesanan pada contoh panjang dan membungkus beberapa baris. Template wajib diuji dengan judul panjang, pembayaran berulang, dan halaman tambahan. Isi catatan dokumen dan kategori layanan diperlakukan sebagai data contoh. Template baru memakai catatan bisnis yang ditinjau pemilik.

Sumber lokal [invoice referensi](C:/Users/khair/Downloads/invoice-4ca6d6d5-2c88-4235-9277-61729f5a6b5c.pdf).

### 2.2 Gambar kantor

Elemen visual yang diambil

- Kamera isometrik dari atas dengan ruangan terbuka seperti diorama.
- Lantai kayu gelap, dinding kaca, pencahayaan hangat, tanaman, komputer, rak, dan kursi.
- Beberapa zona kerja, lounge, pantry, ruang rapat, serta teras dengan kolam sebagai pengembangan.
- Karakter manusia dengan label nama dan jabatan.
- Balon aktivitas singkat di atas karakter.
- Navigasi per ruangan dan panel percakapan aktivitas di bawah layar.

Bingkai TikTok, komentar penonton, dan kontrol siaran pada referensi berasal dari aplikasi tempat gambar diambil. Brief produk menggunakan bagian kantor, karakter, dan panel aktivitas kerja sebagai acuan.

Sumber lokal [gambar referensi](C:/Users/khair/AppData/Local/Temp/codex-clipboard-e9bdbfd6-661b-4a13-a8a9-fd197de02d90.png). File berada di folder sementara. Saat implementasi, salin referensi terpilih ke folder aset desain proyek agar tetap tersedia.

## 3. Audit kondisi Hermes sebelum implementasi

### 3.1 Temuan yang terverifikasi

| Komponen | Hasil pemeriksaan | Dampak rancangan |
| --- | --- | --- |
| Instalasi | Hermes Agent `v0.21.7+158.g7cc3fb8.dirty`, label `2026.9.24`, metode Git | Integrasi harus diuji terhadap versi lokal ini |
| Lokasi runtime | `C:\Users\khair\AppData\Local\hermes` | Resolusi home memakai runtime aktif |
| Source Hermes | `C:\Users\khair\AppData\Local\hermes\hermes-agent` | Source lokal tersedia untuk pemeriksaan kontrak |
| Profil aktif | `private-ai-house` | Setiap panggilan integrasi harus memilih profil secara eksplisit |
| Provider profil aktif | `custom:9router-local`, model `ComboHermes` | Kesehatan router dan inference perlu diuji sebelum fitur agent dinyatakan siap |
| Batas agent | `max_turns` 150, reasoning `medium`, terminal `local` | Profil kantor membutuhkan batas biaya dan akses yang lebih sempit |
| Gateway | Berjalan melalui default-profile multiplexer, PID 29124 saat pemeriksaan | Gunakan gateway yang sudah tersedia |
| Endpoint profil | `http://127.0.0.1:8642/p/private-ai-house/v1` | Backend aplikasi menjadi penghubung ke API lokal |
| Health | `GET /p/private-ai-house/health` mengembalikan HTTP 200 dan `ok` | Proses API dapat dijangkau |
| Endpoint terlindungi | `/v1/models` dan `/v1/capabilities` mengembalikan HTTP 401 pada pemeriksaan tanpa kredensial yang berhasil diresolusikan | Autentikasi integrasi belum terbukti |
| Cron | Scheduler host aktif, heartbeat terdeteksi | Penjadwal tersedia |
| Cron profil aktif | Satu job berstatus completed dan disabled, CLI melaporkan tidak ada job aktif | Job kantor baru perlu dikonfigurasi pada tahap implementasi |
| Kanban | CLI, board, dependency, claim, review, event, dan dispatcher tersedia | Gunakan mekanisme native Hermes |
| Board yang ditemukan | `fvh-house` memiliki 11 done, 3 blocked, 1 scheduled, 0 running saat pemeriksaan | Ada pekerjaan lain yang memerlukan pemisahan board |
| Profil spesialis | Profil invoice, payment, WhatsApp, chief-of-staff, dan beberapa peran lain sudah ada | Nama profil belum membuktikan kesesuaian izin atau kesehatan setiap profil |
| WhatsApp | Source bridge Baileys dan adapter pengiriman dokumen tersedia | Kemampuan transport PDF sudah ada |
| Pairing | File pairing standar tidak ditemukan pada default, `private-ai-house`, dan lokasi standar `fvh-whatsapp-operator` yang diperiksa | Status siap-kirim belum terbukti, lokasi custom belum diaudit |
| Versi Baileys bridge | Dependency pada `package.json` source dipatok `7.0.0-rc13` | Uji versi runtime dan protokol sebelum memilih perubahan dependency |
| Perubahan lokal | `gateway/platforms/api_server.py` berstatus modified | Simpan dan pahami diff sebelum upgrade Hermes |
| Perangkat | RAM sekitar 15,7 GiB, Intel UHD dan NVIDIA RTX 3050 Laptop GPU | Layak untuk prototipe 3D, target FPS tetap harus diukur |
| Runtime aplikasi | Node `v24.19.0`, pnpm `12.9.1`, Python Hermes `3.14.7` | Tool dasar tersedia |

### 3.2 Kesimpulan kesiapan

Hermes sudah memiliki fondasi yang diperlukan. Gateway dan scheduler hidup. Kemampuan inference, autentikasi aplikasi, pengiriman WhatsApp, serta seluruh profil spesialis masih membutuhkan uji integrasi. HTTP 401 menunjukkan akses ditolak pada permintaan tersebut. Penyebabnya belum dapat disimpulkan sebagai kredensial hilang karena konfigurasi dapat memakai resolver secret lain.

Pembacaan konfigurasi hanya menghasilkan ringkasan field yang relevan. Audit tidak menampilkan credential. Isi percakapan dan isi tugas board lain tidak diperlukan untuk planning.

### 3.3 Tindakan pada fase fondasi

1. Catat versi, simpan diff lokal API, dan buat backup yang dapat dipulihkan sebelum perubahan Hermes.
2. Gunakan board khusus `synectra-office` agar tugas kantor terpisah dari `fvh-house`.
3. Sediakan profil lead kantor dengan izin terukur. Pemakaian ulang profil spesialis dilakukan setelah meninjau toolset dan ruang kerjanya.
4. Resolusikan credential API melalui konfigurasi yang didukung Hermes, lalu simpan hanya pada backend.
5. Uji request read-only berautentikasi, kemudian satu inference pendek dengan tool terbatas dan biaya tercatat.
6. Pair nomor WhatsApp pilihan pemilik melalui alur Hermes yang tersedia.
7. Uji satu PDF sintetis ke nomor uji milik pemilik.
8. Uji scheduler restart dan pemisahan board sebelum job bisnis diaktifkan.

Hermes menyediakan API kompatibel OpenAI dan streaming progress tool. Kanban native menyediakan task durable dan koordinasi lintas profil. Detail endpoint dapat berubah sehingga pemeriksaan versi lokal menjadi gerbang integrasi. [API Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server), [Kanban Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban).

## 4. Sintesis riset dan pilihan arsitektur

### 4.1 Stack yang dipilih

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| UI dan formulir | React + TypeScript + Vite | Cocok untuk aplikasi privat interaktif dan canvas 3D |
| Dunia 3D | Three.js + React Three Fiber + Drei | Kamera, pemilihan objek, GLB, animasi, dan pengelolaan scene |
| State tampilan | Zustand untuk pilihan karakter dan layout UI, TanStack Query untuk data server | Perubahan visual cepat dan data bisnis memiliki pemilik jelas |
| Backend | Node.js + TypeScript + Fastify | API lokal, validasi, antrean worker, dan integrasi proses Hermes |
| Data | Cloud Firestore melalui Admin SDK backend | Dokumen bisnis dan metadata file lokal |
| Login | Backend Node.js dengan password hash dan sesi aplikasi | Akses pemilik pada localhost |
| File | Filesystem lokal privat | PDF, tanda tangan dan bukti pembayaran |
| Pembaruan bisnis | Firestore listener pada backend dan SSE lokal untuk perubahan record | UI memperoleh status pembayaran, dokumen, dan outbox |
| PDF | Template HTML/CSS cetak + Playwright Chromium | Layout A4 mengikuti invoice referensi |
| WhatsApp awal | Bridge Baileys bawaan Hermes melalui backend | Reuse kemampuan kirim dokumen yang terverifikasi pada source |
| Agent | Hermes API untuk percakapan, CLI terstruktur untuk board | Memakai runtime yang sudah tersedia |
| Job durable | Koleksi outbox dan lease transaksional Firestore | Menyatukan status kirim, retry, dan persetujuan pada satu tempat |
| Jadwal agent | Hermes cron | Jadwal briefing dan koordinasi menggunakan fasilitas native |
| Paket | pnpm, dependency dan versi runtime dipatok | Instalasi development lokal dapat diulang |

Vite menyediakan dev server dan build aset web. Fastify memiliki kebijakan dukungan versi. Versi library final dipilih melalui compatibility check React, R3F, Node, dan lockfile pada fase fondasi. [Vite](https://vite.dev/guide/), [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/).

### 4.2 Bentuk sistem

```text
Browser pemilik
  React UI + canvas kantor 3D
  Login backend + SSE status bisnis
             |
             | API aplikasi dengan sesi aplikasi pengguna
             v
Backend kantor lokal
  Nota dan pembayaran
  Renderer PDF
  Outbox worker
  Adapter Hermes dan bridge WhatsApp
       |                  |                    |
       v                  v                    v
Firestore cloud      Hermes lokal         Bridge Baileys
Database dokumen     Lead dan Kanban      Satu sesi nomor
Metadata file        Cron lokal           Pengiriman PDF

Backend lokal memiliki login, sesi, dan filesystem privat.
```

Renderer 3D bekerja pada GPU browser. Backend localhost menjalankan API, PDF, serta koneksi layanan. Layanan agent dan pengiriman tetap berjalan ketika tab kantor ditutup selama proses host aktif.

Gunakan satu backend aplikasi dengan modul jelas. Worker awal dapat berjalan dalam proses yang sama, dengan entry point terpisah tersedia ketika isolasi renderer PDF diperlukan. Invariant antrean tetap berada pada transaksi database.

### 4.3 Pembagian kepemilikan data

- Firebase Cloud Firestore memiliki data klien, nota, revisi, pembayaran, persetujuan kirim, outbox, dan konfigurasi visual.
- Hermes memiliki lifecycle task agent, claim worker, dependency task, dan jadwal agent.
- Firebase Cloud Firestore menyimpan referensi `hermes_board` dan `hermes_task_id` serta proyeksi status yang dapat dibangun ulang.
- Bridge WhatsApp memiliki socket dan credential sesi. Satu akun mempunyai satu pemilik koneksi aktif.
- Browser memiliki interpolasi posisi, animasi, dan aktivitas dekoratif sementara.

Satu peristiwa bisnis cukup diperbarui ketika status berubah. Posisi karakter per-frame dikelola di browser agar animasi tidak membebani database.

### 4.4 Multi-layered architecture

Gunakan **modular monolith berlapis**. Modul bisnis berada dalam satu codebase dengan batas fitur yang jelas. UI web, backend, dan proses Hermes tetap mempunyai batas runtime masing-masing. Pemisahan lapisan bersifat logis dan dipakai untuk development pada laptop melalui localhost.

| Lapisan | Tanggung jawab | Contoh pada aplikasi |
| --- | --- | --- |
| 1. Presentation | Menerima interaksi, memvalidasi bentuk input, menerjemahkan hasil dan error | React, scene 3D, formulir, HTTP controller, SSE, entry point worker |
| 2. Application | Menjalankan use case, memeriksa hak aktor, mengatur transaksi dan koordinasi I/O | Terbitkan nota, verifikasi pembayaran, setujui pengiriman, proses outbox |
| 3. Domain | Menjaga aturan bisnis dan transisi yang sah | Perhitungan rupiah, snapshot revisi, batas perubahan nota, syarat approval |
| 4. Infrastructure | Mengimplementasikan akses teknologi melalui kontrak I/O yang diperlukan use case | Repository Firestore, penyimpanan file lokal privat, renderer PDF, adapter Hermes dan Baileys |
| 5. Data dan external systems | Menyimpan state durable atau menjalankan layanan luar | Firebase Cloud Firestore, filesystem sesi privat, Hermes runtime, WhatsApp network |

Lapisan kelima menjelaskan batas deployment. Database dan layanan eksternal diakses melalui infrastructure. Domain tidak bergantung pada React, Fastify, Firestore Admin SDK, filesystem, atau Hermes.

```text
LAPISAN PRESENTATION
  Browser React dan kantor 3D
  HTTP controller, SSE, worker entry point
                      |
                      v
LAPISAN APPLICATION
  Use case, otorisasi, koordinasi transaksi
               |                 |
               v                 v
LAPISAN DOMAIN            Kontrak I/O application
  Aturan nota              Repository dan transport
  Nilai pembayaran                  ^
  Transisi status                   | diimplementasikan oleh
                          LAPISAN INFRASTRUCTURE
                            Firestore, PDF lokal, Hermes, Baileys
                                    |
                                    v
                          DATA DAN EXTERNAL SYSTEMS
                            Firebase Cloud Firestore, Hermes, WhatsApp
```

`bootstrap` menjadi composition root. Bagian ini membaca konfigurasi tervalidasi, membuat koneksi, memasang adapter, lalu menghubungkannya dengan use case dan controller. Secret hanya disuntikkan kepada adapter yang memerlukannya.

### 4.5 Aturan dependensi dan batas modul

1. Presentation memanggil application melalui use case. Controller menangani request/response dan memetakan error.
2. Application menggunakan aturan domain serta kontrak I/O yang benar-benar dibutuhkan.
3. Domain berupa tipe dan fungsi bisnis murni. Gunakan class hanya ketika identitas dan lifecycle objek memang memerlukannya.
4. Infrastructure mengimplementasikan kontrak tersebut. Import SDK vendor ditempatkan di adapter terkait.
5. Composition root menghubungkan implementasi konkret. Modul bisnis memakai dependency injection melalui parameter atau factory sederhana.
6. Modul mengakses fitur modul lain melalui public entry point yang sempit, dengan tipe hasil dan error yang jelas.
7. Operasi atomik memakai satu transaksi Firestore. Callback transaksi dapat diulang, sehingga efek seperti pengiriman, inference dan file I/O ditempatkan setelah commit.
8. Keunikan nomor dan deduplikasi memakai dokumen reservasi ber-ID deterministik. Backend memvalidasi relasi owner, dengan lease dan fencing token pada transaksi Firestore.
9. Frontend memakai sesi aplikasi dan SSE dari backend localhost. Semua akses database serta mutasi bisnis melewati application layer backend.
10. Frontend boleh menghitung preview nilai untuk respons cepat. Nilai final selalu dihitung dan diverifikasi backend.
11. Payload task, receipt, dan dokumen dipetakan menjadi DTO aplikasi sebelum dikirim ke browser.
12. Status karakter mengikuti proyeksi event bisnis. Simulasi animasi tidak memiliki akses menulis payment atau approval.

Kontrak repository dibuat per kebutuhan agregat, misalnya transaksi penerbitan nota dan claim delivery. Hindari base repository generik, interface untuk setiap fungsi, dan service yang hanya meneruskan satu pemanggilan. Logging, validasi konfigurasi, dan autentikasi memakai fasilitas framework serta fungsi bersama secukupnya.

### 4.6 Struktur folder yang direncanakan

Root implementasi berada di `D:\portofolio\synectra-office`. Struktur berikut merupakan rancangan folder untuk tahap pembangunan.

```text
synectra-office/
  apps/
    web/
      src/
        app/                     router, provider, navigasi, app shell
        features/
          invoices/              formulir, daftar, preview, API client
          clients/               data klien dan pencarian
          payments/              ledger dan verifikasi
          deliveries/            outbox dan status WhatsApp
          agents/                chat, profil, status Hermes
          kanban/                board, kartu, detail task
          schedules/             jadwal dan riwayat eksekusi
          office/
            scene/               ruangan, kamera, cahaya, furnitur
            characters/          model humanoid dan animasi
            interactions/        selection dan interaction anchor
            simulation/          waypoint, reservasi objek, idle
            ui/                  label, bubble, drawer, toolbar
        shared/                  komponen aksesibel dan utilitas UI
      public/
        models/                  aset GLB terpilih
        textures/                tekstur kantor
        audio/                   ambience dan efek pilihan
    server/
      src/
        bootstrap/               konfigurasi, wiring, lifecycle proses
        modules/
          invoices/
            presentation/        route dan controller nota
            application/         create-draft, issue, revise, get-pdf
            domain/              aturan nota, total, revisi
            infrastructure/      repository dan template PDF
          clients/
          payments/
          deliveries/
            presentation/        route approval dan worker entry point
            application/         approve, enqueue, dispatch, reconcile
            domain/              state pengiriman dan dedupe identity
            infrastructure/      repository outbox dan adapter bridge
          agents/                use case dan adapter Hermes
          kanban/                transisi, board scope, adapter CLI
          schedules/             jadwal dan adapter cron Hermes
          office/                preferensi dan proyeksi event visual
        platform/
          auth/                  login, sesi, aktor, dan policy akses
          database/              koneksi dan fasilitas transaksi
          storage/               akses filesystem privat
          observability/         log tersaring dan correlation ID
          pdf/                   lifecycle renderer Chromium
        main.ts                  server entry point
  packages/
    contracts/                   schema request, response, dan event bersama
  firebase/
    firestore.rules              penolakan akses client langsung
    firestore.indexes.json       index query database
  data/private/                  file privat lokal, dikecualikan dari Git
  scripts/seed-development.ts    data sintetis terisolasi saat diperlukan
  tests/
    integration/                 database, adapter, transaksi
    e2e/                         alur pengguna lintas modul
  assets/
    design/                      referensi dan konsep visual
  pnpm-workspace.yaml
```

Modul lain memakai struktur berlapis yang sama ketika kebutuhannya muncul. Folder kosong dibuat saat diperlukan. Schema pada `packages/contracts` hanya memuat data yang aman dipertukarkan. Konfigurasi dan model persistence internal tetap berada di server.

### 4.7 Contoh alur lintas lapisan

**Penerbitan nota**

1. Form React mengirim draft ID dan versi yang terakhir dilihat pengguna.
2. Controller memvalidasi schema request dan identitas aktor.
3. Use case `issueInvoice` memeriksa kepemilikan, status draft, serta konflik versi.
4. Domain menghitung total, memvalidasi detail, dan membentuk snapshot.
5. Repository menjalankan transaksi alokasi nomor, simpan snapshot, dan catatan audit.
6. Adapter renderer membuat PDF dari snapshot. Adapter filesystem menyimpan file privat pada disk lokal.
7. Repository menandai revisi `ready` setelah file dan hash terverifikasi.
8. Controller mengembalikan DTO. UI memperbarui preview dan karakter administrasi melalui event hasil.

**Pengiriman WhatsApp**

1. Pemilik memeriksa penerima, caption, dan revisi PDF pada drawer pengiriman.
2. Use case `approveDelivery` mengikat persetujuan pada hash konten dan penerima.
3. Repository menyimpan approval dan outbox secara atomik.
4. Worker entry point memanggil use case `dispatchDelivery`.
5. Repository mengklaim record dengan lease dan fencing token.
6. Domain dan application memeriksa kondisi kirim, approval, serta revisi yang masih berlaku.
7. Adapter bridge memeriksa sesi dan mengirim PDF yang dipilih backend.
8. Repository merekam attempt, message ID, serta status atau hasil ambigu.
9. Event hasil memperbarui outbox dan aktivitas karakter komunikasi.

### 4.8 Pembuktian batas arsitektur

- Unit test domain mencakup nilai uang, status pembayaran, dan transisi revisi tanpa koneksi layanan.
- Test application mencakup izin aktor, approval, failure path, dan urutan efek menggunakan adapter uji kecil.
- Integration test memakai Firestore development untuk membuktikan transaksi, nomor unik, otorisasi backend, IAM, dan claim worker bersamaan.
- Contract test memverifikasi payload bridge serta Hermes terhadap versi runtime yang dipatok.
- E2E membuktikan klik meja, buat nota, preview, approval, dan status pengiriman.
- Aturan lint import mencegah domain mengimpor infrastructure dan web mengimpor implementasi server.
- Typecheck dan pemeriksaan dependensi melindungi `packages/contracts` dari secret atau tipe vendor internal.

Pada deployment awal, backend dan worker dapat hidup dalam satu proses dengan lifecycle yang dikelola composition root. Pemisahan proses mengikuti kebutuhan isolasi dan pengukuran beban. Batas lapisan dan kontrak bisnis diperiksa pada setiap fitur development lokal.

## 5. Rincian fitur nota dan pembayaran

### 5.1 Data utama

| Kelompok | Field |
| --- | --- |
| Identitas nota | ID internal UUID, nomor nota, tanggal terbit, revisi, mata uang IDR |
| Klien | Nama, nomor WhatsApp, email opsional, alamat opsional |
| Pesanan | Judul, kategori, deskripsi, status pengerjaan |
| Nilai | Item, jumlah, harga, total, pembayaran terverifikasi, sisa, kelebihan bayar bila ada |
| Pembayaran | Jenis DP/pelunasan/cicilan, nominal, tanggal, metode, referensi, status verifikasi |
| Pengirim | Nama bisnis, identitas penandatangan, tanda tangan versi tertentu |
| Dokumen | Catatan, PDF path, hash PDF, snapshot data, waktu penerbitan |
| Pengiriman | Penerima tervalidasi, versi nota, waktu rencana kirim, status outbox, message ID bila tersedia |

Field deadline ditiadakan sesuai permintaan. `scheduled_at` hanya mengatur kapan dokumen dikirim. Masa berlaku persetujuan dan link adalah kontrol teknis pengiriman.

### 5.2 Aturan bisnis

- Nomor nota dibuat server-side dalam transaksi. Pola awal `INV-YYYYMM-000001` memakai counter per pemilik dan bulan.
- Counter dan reservasi nomor ber-ID deterministik dalam transaksi Firestore melindungi penerbitan bersamaan. Nomor yang sudah diterbitkan tetap memiliki jejak audit.
- Nominal IDR disimpan sebagai integer rupiah. Kuantitas pecahan, bila diperlukan, memakai decimal dengan aturan pembulatan eksplisit.
- Total dibayar dihitung dari payment yang terverifikasi setelah memperhitungkan reversal/refund.
- Sisa ditampilkan sebagai nilai minimum nol. Selisih negatif ditampilkan terpisah sebagai kelebihan bayar.
- Status pembayaran diturunkan dari ledger. Pemilik memverifikasi pembayaran setelah memeriksa bukti.
- Koreksi payment menggunakan reversal beralasan sehingga audit tetap dapat ditelusuri.
- Nota draft dapat diedit. Penerbitan menghasilkan snapshot immutable, versi template, dan versi tanda tangan.
- Perubahan setelah terbit membuat revisi baru. Pengiriman ulang memilih revisi secara eksplisit.
- Status order selesai dapat bersamaan dengan pembayaran sebagian, sesuai contoh pengguna.

### 5.3 Alur sehari-hari

1. Klik meja administrasi atau tombol `Buat nota`.
2. Pilih klien, isi detail pesanan, dan nominal.
3. Masukkan pembayaran awal bila ada.
4. Lihat preview A4 bertanda tangan.
5. Terbitkan snapshot final.
6. Periksa nomor WhatsApp, caption, dan PDF yang akan dikirim.
7. Klik `Kirim PDF` atau pilih jadwal kirim.
8. Lihat status dari outbox dan bukti transport yang tersedia.
9. Saat pembayaran masuk, verifikasi ledger lalu buat revisi nota jika ringkasan perlu diperbarui.

### 5.4 Template PDF

- Header merek di kiri, nomor di kanan, garis hitam di bawah.
- Tanggal dan status order di kiri, penerima di kanan.
- Detail judul, kategori, dan deskripsi tersusun vertikal.
- Riwayat pembayaran berupa tabel.
- Ringkasan total, dibayar, dan sisa berada di kanan.
- Catatan di bawah kiri dan tanda tangan di bawah kanan.
- Typography gelap, latar putih, aksen abu-abu, indikator pembayaran hijau lembut.
- Ukuran A4, margin sekitar 16–18 mm, font lokal tersemat, teks dapat diseleksi.
- Tabel berlanjut ke halaman berikutnya dengan header berulang. Blok tanda tangan dijaga agar utuh pada halaman terakhir.
- Uji layout dengan tanda tangan transparan, judul panjang, dan minimal 30 baris riwayat pembayaran.

Playwright mendukung pembuatan PDF memakai CSS cetak. Jalankan Chromium pada host aplikasi dengan template terkontrol dan akses jaringan renderer dibatasi. [Playwright PDF](https://playwright.dev/docs/api/class-page#page-pdf).

Tanda tangan awal berupa gambar yang disetujui pemilik. Bila kelak dibutuhkan validasi kriptografis atau sertifikasi tanda tangan, kebutuhan tersebut menjadi modul terpisah dengan persyaratan penyedia yang diverifikasi.

## 6. WhatsApp melalui Baileys

### 6.1 Jalur awal yang dipilih

Source Hermes yang diperiksa sudah memiliki `send_document`, endpoint bridge `POST /send-media`, dan response `messageId`. Gunakan adapter backend yang memanggil jalur kirim Hermes/bridge yang didukung versi terpasang. Alur bisnis tetap dijalankan kode aplikasi sehingga pengiriman PDF dapat berfungsi tanpa inference LLM.

Fungsi adapter menerima `delivery_id` dan memuat penerima serta PDF dari database. Browser tidak boleh menentukan path lokal file yang akan dibaca bridge. Backend memverifikasi identitas sesi melalui health bridge sebelum pengiriman.

Baileys menghubungkan akun WhatsApp melalui linked-device session. Pairing memerlukan tindakan pemilik. Penggunaan Baileys membawa risiko pembatasan akun, logout, dan perubahan protokol. Nomor bisnis khusus, penerima yang menyetujui komunikasi, dan volume transaksi wajar menjadi batas operasional. [Baileys quickstart](https://baileys.wiki/quickstart), [WhatsApp Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp).

### 6.2 Temuan penting pada bridge lokal

- Dependency bridge adalah `7.0.0-rc13`.
- Bridge bind ke `127.0.0.1` dan memvalidasi Host header.
- Pengiriman dokumen menerima file lokal dan menghasilkan message ID bila tersedia.
- Handler `messages.update` yang diperiksa berfokus pada poll updates. Jalur penerusan delivery/read receipt untuk web nota belum ditemukan.
- Endpoint `/messages` mengambil lalu mengosongkan antrean masuk. Penggunaan consumer kedua akan berpotensi mengambil pesan yang dibutuhkan Hermes.
- Bridge menggunakan `useMultiFileAuthState` untuk credential dan Signal keys.

Konsekuensi implementasi

1. Integrasikan outbound melalui satu adapter backend.
2. Gunakan satu consumer inbound yang dikelola Hermes.
3. Ambil event kantor dari event Hermes atau ekstensi event yang disetujui, lalu publikasikan ke UI.
4. Status tahap awal berhenti pada `submitted` jika hanya message ID yang tersedia.
5. Dukungan `delivered` dan `read` memerlukan jalur receipt yang diuji dengan versi bridge tersebut.
6. Fase penguatan dapat menambah hook resmi atau perubahan bridge yang terisolasi dan dipatok versinya.
7. Jika bridge gagal memenuhi receipt dan persistence yang diperlukan, evaluasi worker Baileys milik aplikasi. Migrasikan kepemilikan nomor secara tunggal dan hentikan sesi lama terlebih dahulu.

Keputusan fase awal menggunakan bridge lama mengurangi duplikasi. Biaya teknisnya berupa keterbatasan receipt dan pekerjaan penguatan persistence sebelum pemakaian bisnis rutin.

### 6.3 State koneksi dan state pengiriman

State koneksi

`unpaired`, `pairing`, `connecting`, `connected`, `reconnecting`, `logged_out`, `error`.

State pengiriman

`draft`, `approved`, `scheduled`, `queued`, `sending`, `submitted`, `delivered`, `read`, `failed`, `unknown`, `cancelled`.

`submitted` berarti permintaan kirim menghasilkan bukti transport yang tersedia. `delivered` memerlukan receipt penerima. `read` memerlukan receipt baca. UI menampilkan waktu dan sumber bukti. Receipt yang terlambat tidak boleh menurunkan status yang sudah lebih kuat.

Baileys menyediakan event koneksi, perubahan pesan, dan receipt. Pemetaan status memakai enum dari versi dependency yang dipatok. [Baileys events](https://baileys.wiki/concepts/events).

### 6.4 Antrean, retry, dan laptop mati

1. Simpan approval dan record outbox dalam satu transaksi setelah versi PDF siap.
2. Kunci logis pengiriman mengikat nota, revisi, penerima, kanal, dan tujuan pengiriman.
3. Worker mengklaim satu dokumen secara atomik dengan lease dan fencing token.
4. Periksa approval, hash PDF, nomor, sesi, serta waktu kirim sebelum efek eksternal.
5. Catat attempt sebelum menghubungi bridge.
6. Simpan message ID dan hasil setelah bridge merespons.
7. Retry otomatis hanya untuk kegagalan yang terbukti belum mengirim, dengan backoff dan batas percobaan.
8. Timeout setelah request diterima transport menghasilkan `unknown`. Rekonsiliasi dilakukan sebelum pemilik memilih kirim ulang.
9. Double-click mengembalikan delivery yang sama. Pengiriman ulang yang disengaja menghasilkan attempt baru dengan alasan.
10. Setelah laptop menyala, worker merebut kembali lease yang kedaluwarsa dan meninjau job tertunda.
11. Job yang terlambat jauh atau persetujuannya kedaluwarsa kembali ke antrean review. Batas awal keterlambatan 24 jam merupakan keputusan produk yang dapat disesuaikan.

Worker lokal mengambil outbox Firestore melalui query terindeks dan claim transaksional. Callback transaksi hanya mengakses database. Pengiriman dilakukan setelah commit dan hasil ambigu direkonsiliasi melalui attempt. [Transaksi Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

### 6.5 Persistence sesi dan data pribadi

- QR hanya ditampilkan kepada pemilik yang login, dengan masa berlaku dan indikator kedaluwarsa.
- Secret sesi disimpan pada host bridge dengan hak akses terbatas dan backup terenkripsi.
- Credential dan Signal keys harus dipulihkan sebagai pasangan konsisten.
- Reconnect memakai backoff berjitter, satu proses pemilik sesi, dan batas restart.
- Logout atau sesi diganti meminta pairing ulang melalui UI pemilik.
- Sebelum pemakaian rutin, uji restart dan listrik terputus. Evaluasi auth store transaksional karena dokumentasi Baileys memberi batasan pada helper multifile untuk production.
- Auth state Baileys disimpan privat pada host worker dengan enkripsi backup dan satu pemilik sesi. Browser memperoleh status sesi yang disaring.
- Normalisasi nomor ke format internasional. Nomor Indonesia `08…` diproses menjadi `62…` setelah validasi.
- Tangani pemetaan phone JID dan LID melalui utilitas Baileys versi terpasang.
- Simpan pesan yang relevan pada transaksi nota dan receipt. Batasi sinkronisasi history sesuai kemampuan versi library.
- Kirim PDF sebagai attachment dengan MIME `application/pdf` dan nama file yang konsisten.

Baileys mendukung media dari buffer, URL, atau stream. Auth store wajib menyimpan perubahan credential dan Signal keys dengan serialization yang sesuai. [Media Baileys](https://baileys.wiki/messaging/media-messages), [Session management](https://baileys.wiki/authentication/session-management), [JID Baileys](https://baileys.wiki/concepts/jids).

### 6.6 Cadangan saat koneksi gagal

Sediakan `Unduh PDF` dan `Buka WhatsApp` pada delivery gagal. Click-to-chat menyiapkan percakapan dan teks. Pemilik melampirkan PDF serta mengirim melalui aplikasi WhatsApp. Catat konfirmasi manual sebagai bukti yang berbeda dari receipt sistem. [WhatsApp click-to-chat](https://faq.whatsapp.com/5913398998672934).

Cloud API tercatat sebagai opsi migrasi di masa depan. Tarif terkini belum dipastikan karena halaman developer meminta login, sementara halaman publik menampilkan informasi yang perlu direkonsiliasi dengan rate card akun. Planning biaya awal mengikuti Baileys. [WhatsApp platform pricing](https://whatsappbusiness.com/products/platform-pricing/).

## 7. Brief visual kantor 3D

### Visualisasi konsep yang dibuat

![Konsep kantor Synectra dengan karakter manusia, ruangan kaca, dan pencahayaan hangat](D:/portofolio/synectra-office/synectra-office-concept-v1.png)

Gambar dibuat menggunakan imagegen bawaan pada 3 November 2026. Konsep menampilkan empat karakter manusia, ruang lead Hermes, ruang rapat dengan papan tugas, meja administrasi, meja komunikasi, pantry, lounge, resepsionis, dan teras kolam. Kolam menggambarkan fase perluasan yang sudah disebut pada brief. Merek Synectra mengikuti asumsi pada invoice lama.

Gambar menjadi target arah artistik. Tingkat detail scene interaktif dikalibrasi melalui prototype dan pengukuran GPU. Aset humanoid, rig, animasi, serta denah navigasi perlu dibangun pada tahap implementasi.

File tersimpan di [visual kantor](D:/portofolio/synectra-office/synectra-office-concept-v1.png).

<details>
<summary>Prompt final visualisasi</summary>

```text
Use case: stylized-concept. Asset type: high-fidelity visual concept for an Indonesian private web app named Synectra office. Create one beautiful wide landscape 16:9 image of a richly detailed, believable 3D isometric cutaway office, seen from a 45-degree aerial orthographic camera. This is a miniature architectural world with recognizable realistic adult human proportions and natural faces, inspired by life-simulation office games. Composition: the office fills almost the entire image, with all rooms and pathways readable. Dark midnight navy background, walnut wood floors, black-framed glass partitions, warm pendant lights, soft cinematic ambient occlusion, indoor plants, bookshelves, computer monitors, upholstered chairs and natural material textures. Four human characters total: a male owner in smart casual clothing near reception, Hermes as a human male lead in his glass office reviewing work, a female administration employee sitting naturally at a computer with a printer and invoice papers nearby, and a male communications employee at a workstation. Characters have normal human heads, articulated hands and legs, diverse Indonesian appearance, contemporary professional clothes, convincing seated and standing poses. Layout: back-left glass lead office with desk and bookshelf; back-right glass meeting room with table and a visible task board with small colored cards; central administration and communications workstations; front-left cozy pantry with coffee machine and lounge sofa; front-right reception counter and filing cabinets; along the front edge a small terrace with turquoise swimming pool and two lounge chairs, presenting the future expanded office vision. Realistic connected walkable circulation, coherent scale, no disconnected rooms. Subtle web application treatment only: a narrow top navigation strip reading 'Synectra office', 'Kantor', 'Nota', 'Kanban', 'Jadwal', and a small 'Buat nota' button. Small tasteful floating name labels 'Hermes', 'Administrasi', 'Komunikasi' over their characters. One tiny activity bubble reading 'Menyiapkan nota'. Leave the architecture and humans visually dominant. Visual polish should resemble a premium game environment screenshot, with crisp architectural detail, inviting warm evening atmosphere, readable furniture and subtle depth. Avoid TikTok or streaming UI, social feeds, watermarks, copyrighted game logos, cartoon blob people, chibi characters, voxel or block characters, oversized heads, schematic diagrams, exaggerated sci-fi interfaces, neon glow overload, and fake photoreal browser chrome.
```

</details>

### 7.1 Bahasa visual

Gunakan kantor modern bergaya semi-realistis dengan kamera orthographic. Orientasi awal sekitar 45 derajat horizontal dan elevasi 35 derajat, lalu disesuaikan pada prototype. Lantai kayu, frame kaca hitam, lampu kuning lembut, permukaan meja gelap, dan tanaman membentuk suasana seperti referensi.

Palet awal

- Latar luar kantor `#101326`.
- Panel aplikasi `#1B2033`.
- Kayu `#755944`.
- Cahaya hangat `#F2D29A`.
- Aksen kolam `#388DA7`.
- Teks `#F4F3EF` dan status aktif `#72C7A5`.

Dinding depan memakai cutaway atau transparansi saat menghalangi karakter. Label dan balon aktivitas menggunakan overlay HTML dengan occlusion sederhana. Kamera menyediakan zoom, pan, reset, dan fokus ruangan.

### 7.2 Denah awal

```text
+----------------------+-----------------------+
| Ruang Hermes         | Ruang rapat           |
| Meja lead + briefing | Meja bersama + board  |
+----------------------+-----------------------+
| Meja administrasi    | Meja komunikasi       |
| Nota + pembayaran    | WhatsApp + outbox     |
+----------------------+-----------------------+
| Pantry + lounge      | Resepsionis + arsip   |
| Kopi + idle          | Klien + pencarian     |
+----------------------+-----------------------+
| Teras dan kolam pada perluasan berikutnya    |
+---------------------------------------------+
```

Layout awal memasukkan suasana referensi sambil menjaga jumlah aset yang harus dibuat. Kolam, tangga, lantai tambahan, studio, dan ruang gaming masuk fase perluasan.

### 7.3 Susunan layar

```text
+----------------------------------------------------------+
| Synectra office   [Semua] [Admin] [Rapat] [Lounge]   18.00 |
| Hermes aktif   WA terhubung   Antrean 2     [Buat nota]    |
+----------------------------------------+-----------------+
|                                        | Karakter dipilih|
|              KANTOR 3D                 | Jabatan         |
|                                        | Tugas dan status|
|  manusia, meja, balon aktivitas         | Aksi dan chat   |
|                                        |                 |
+----------------------------------------+-----------------+
| Aktivitas kerja    Percakapan Hermes    Job terjadwal     |
| Ringkasan hasil, error yang perlu tindakan, approval      |
+----------------------------------------------------------+
```

Pada desktop, kantor memakai sekitar 65–75% area utama. Drawer detail dapat ditutup. Pada mobile, kantor ringkas berada di atas dan form memakai layar penuh. Setiap interaksi objek juga memiliki tombol DOM yang dapat diakses keyboard.

## 8. Karakter manusia dan interaksi seperti simulasi kehidupan

### 8.1 Empat karakter awal

| Karakter | Tampilan dan lokasi | Fungsi |
| --- | --- | --- |
| Pemilik | Avatar yang dapat disesuaikan | Berjalan, memilih objek, menyetujui tindakan |
| Hermes | Lead di ruang kerja utama | Briefing, membagi tugas, menjelaskan hambatan |
| Staf administrasi | Manusia berbusana kantor | Menyiapkan nota, membuka ledger dan preview |
| Staf komunikasi | Manusia di meja komputer | Memperlihatkan status WhatsApp dan antrean |

Karakter visual dapat mewakili fungsi deterministik aplikasi. Jumlah karakter yang terlihat tidak mengharuskan jumlah proses LLM yang sama. Identitas karakter mencakup nama, peran, warna pakaian, model, hairstyle, meja, dan profil Hermes bila ada.

### 8.2 Standar model manusia

- Proporsi manusia dewasa, wajah terbaca saat zoom, tangan dan kaki lengkap.
- Rig humanoid, pakaian kantor, ragam rambut dan warna kulit.
- Karakter mendapat animasi bernapas, melihat sekitar, berjalan, duduk, mengetik, berdiri, melambai, dan berpikir.
- Perpindahan animasi menggunakan blend. Posisi kaki, tinggi kursi, dan arah badan diuji agar interaksi terasa alami.
- Setiap karakter mempunyai skeleton dan animation mixer sendiri.
- Model diekspor ke GLB/glTF, tekstur dikompresi, dan level detail disediakan sesuai hasil pengukuran.

Quaternius Universal Base Characters menyediakan basis humanoid dan lisensi CC0, dengan sebagian konten atau source kit bertingkat. Universal Animation Library menyediakan gerak yang dapat diretarget. Pilih aset yang benar-benar termasuk paket yang tersedia, lalu buat animasi mengetik atau minum bila paket belum memuatnya. Simpan bukti lisensi per aset. [Karakter Quaternius](https://quaternius.com/packs/universalbasecharacters.html), [Animasi Quaternius](https://quaternius.com/packs/universalanimationlibrary.html).

Three.js `SkeletonUtils.clone` membantu membuat instance skinned character dengan hubungan tulang yang benar. Drei menyediakan penghubung animation mixer ke komponen React. [SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html), [Drei useAnimations](https://drei.docs.pmnd.rs/abstractions/use-animations).

### 8.3 Interaksi objek

| Interaksi | Respons visual | Respons aplikasi |
| --- | --- | --- |
| Klik karakter | Outline dan fokus kamera | Buka profil, tugas, chat, dan alasan status |
| Klik meja admin | Avatar mendekat atau duduk | Buka form nota |
| Klik printer | Gerak mencetak | Buka preview PDF dan riwayat versi |
| Klik lemari arsip | Pintu terbuka | Cari nota dan klien |
| Klik papan dinding | Kamera mendekat | Buka Kanban |
| Klik meja komunikasi | Aktivitas mengetik | Buka outbox dan status WhatsApp |
| Klik kalender | Highlight | Buka jadwal dan riwayat cron |
| Klik mesin kopi | Minum dan idle singkat | Aktivitas dekoratif atau jeda fokus pemilik |
| Klik sofa | Duduk atau berbincang | Aktivitas dekoratif, dengan chat nyata hanya ketika dipicu |
| Panggil rapat | Karakter berkumpul | Hermes membuat ringkasan jika pemilik meminta |

Gunakan waypoint graph atau grid sederhana untuk navigasi satu lantai. Kursi, komputer, dan mesin kopi memiliki interaction anchor. Reservasi anchor mencegah dua karakter duduk pada tempat yang sama. Perintah berjalan memiliki timeout dan rute pemulihan bila terhalang.

### 8.4 Aturan idle

Pisahkan `work_state` dari `animation_state`. Work state berasal dari backend, sementara animation state memilih gerakan yang sesuai.

- Saat tugas aktif, tampilkan bekerja atau berpikir mengikuti event yang diketahui.
- Saat menunggu review, karakter berada dekat pemilik atau ruang rapat dengan badge tindakan diperlukan.
- Saat koneksi gagal, tampilkan status offline atau terputus beserta waktu terakhir tersambung.
- Saat idle, karakter dapat merapikan meja, minum, membaca, melihat sekitar, atau berbincang pendek.
- Energi, fokus, kenyamanan, dan sosial menjadi atribut simulasi dekoratif.
- Aktivitas dekoratif diberi label bila muncul dalam feed agar dapat dibedakan dari hasil kerja.
- Pengiriman nota dan cron berjalan menurut backend, terlepas dari animasi minum atau duduk.
- Idle memakai aturan lokal dan cooldown. Biaya model muncul ketika ada tugas atau percakapan nyata.
- Tab tersembunyi menghentikan animasi. Saat kembali, UI mengambil snapshot status terkini.
- Mode `Tenang` mengurangi gerakan, balon, dan suara. Audio aktif setelah tindakan pengguna.

Pengembangan berikutnya dapat menambah kustomisasi pakaian, dekorasi meja, siklus siang/malam, cuaca visual, dan karakter spesialis. Aset serta ikon dibuat dengan identitas produk sendiri.

## 9. Hermes sebagai lead agent

### 9.1 Tugas lead

- Mengubah permintaan pemilik menjadi draft nota atau draft task.
- Memeriksa kelengkapan informasi dan meminta field yang belum tersedia.
- Membuat briefing pekerjaan dan ringkasan pembayaran berdasarkan record yang diizinkan.
- Membagi tugas kepada profil spesialis yang telah ditinjau.
- Menjelaskan tugas blocked, approval tertunda, dan error pengiriman.
- Mengusulkan cron dengan preview jadwal, biaya, dan aksi yang akan dilakukan.

### 9.2 Kontrak tool aplikasi

Lead memperoleh tool bisnis terbatas seperti `clients.search`, `invoices.create_draft`, `invoices.preview`, `payments.list`, `deliveries.prepare`, dan `office.get_status`. Kontrak nama bersifat rancangan aplikasi, belum merupakan tool bawaan Hermes.

Tool memvalidasi sesi aplikasi atau credential scoped milik agent, `owner_id`, referensi record, dan batas operasi. Penerbitan final, verifikasi pembayaran, serta pengiriman menggunakan approval pemilik yang diverifikasi backend. Nomor rekening atau nominal yang diajukan agent tetap melalui validasi domain.

Isi PDF, pesan klien, dan deskripsi pekerjaan diperlakukan sebagai data. Toolset lead memisahkan akses bisnis dari shell umum. Profil yang dapat menjalankan shell pada akun OS yang sama tetap memiliki akses host yang luas. Sebelum otonomi bisnis, gunakan OS account atau isolasi proses yang membatasi akses ke credential transport.

### 9.3 Percakapan dan event

- Backend menghubungkan percakapan pengguna dengan session Hermes yang sesuai.
- Capability handshake menentukan endpoint streaming yang didukung versi lokal.
- UI menampilkan progress tool yang ringkas, output akhir, error, dan usage yang tersedia.
- Event bisnis dipetakan ke gerak karakter melalui `agent_id`, `task_id`, `event_id`, dan timestamp.
- Status live yang kehilangan heartbeat menjadi `stale` sampai rekoneksi berhasil.
- Balon `menyiapkan PDF` muncul ketika renderer benar-benar berjalan.
- Balon `menunggu persetujuan` muncul ketika approval diperlukan.
- Pengeluaran model dicatat per run bila API mengembalikan usage. Biaya yang tidak dapat dihitung diberi status belum tersedia.

## 10. Kanban dan cron

### 10.1 Kanban yang mengikuti Hermes

Gunakan status native yang terverifikasi pada versi lokal, mencakup triage, todo, scheduled, ready, running, blocked, review, done, dan archived jika tersedia. UI dapat memakai label Indonesia sambil menyimpan status asli.

- Kartu memuat judul, deskripsi, prioritas, assignee, dependencies, artefak, relasi nota, dan ringkasan hasil.
- Drag-and-drop memanggil transisi yang didukung Hermes. Pemindahan ke running harus mengikuti claim dispatcher.
- Operasi server memakai board eksplisit dan profil eksplisit pada setiap request.
- CLI dipanggil melalui executable dan array argumen terpisah, dengan `shell: false`, timeout, dan validasi ID.
- Gunakan output terstruktur apabila command versi terpasang mendukungnya.
- Perubahan dari Hermes direkonsiliasi menjadi proyeksi Firebase Cloud Firestore melalui cursor event atau polling terbatas.
- Ketika Hermes offline, tampilkan snapshot terakhir beserta waktu sinkronisasi. Mutasi board ditunda dengan status yang terlihat.

Dokumentasi dashboard Hermes yang diperiksa memuat penjelasan autentikasi REST plugin yang tidak konsisten antarbagian. Jalur CLI eksplisit menjadi baseline integrasi Kanban. Pemakaian REST dashboard menunggu pemeriksaan middleware versi aktual dan uji autentikasi. [Kanban Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban).

### 10.2 Pembagian jadwal

| Pekerjaan | Pemilik eksekusi | Jadwal awal |
| --- | --- | --- |
| Kirim nota yang disetujui | Worker outbox aplikasi | Ketika `scheduled_at` tercapai dan host aktif |
| Rekonsiliasi attempt ambigu | Worker aplikasi | Saat reconnect dan tindakan review |
| Briefing harian | Hermes cron | Contoh pukul 09.00 WIB, diaktifkan pemilik |
| Ringkasan pekerjaan | Hermes cron | Contoh pukul 17.00 WIB, hanya jika ada perubahan |
| Pemeriksaan artefak yatim | Worker aplikasi | Harian ketika host aktif |
| Backup | Prosedur backup host dan Firebase Cloud Firestore | Harian, retensi disepakati |

Jadwal disimpan dengan zona `Asia/Jakarta`, timestamp eksekusi memakai UTC. Untuk cron yang memakai UTC, pukul 09.00 WIB setara 02.00 UTC. Periksa timezone scheduler yang benar-benar digunakan sebelum aktivasi.

Hermes cron mendukung job agent serta script-only. Script-only cocok untuk pengecekan deterministik yang tidak memerlukan inference. Job memiliki batas durasi, kebijakan missed-run, dan run identity agar restart tidak memicu pekerjaan ganda. [Cron Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron).

Hermes cron dan worker outbox berjalan pada host lokal. Firestore menyimpan jadwal pengiriman dan state eksekusi sebagai data. Saat laptop mati, pekerjaan tertunda sampai host aktif dan kebijakan missed-run diperiksa.

## 11. Desain database Firestore dan file lokal

### 11.1 Koleksi dan dokumen

Firebase cloud memiliki satu tanggung jawab sebagai database Cloud Firestore. Semua operasi database dilakukan backend melalui Admin SDK dengan credential IAM khusus pengembangan. Login, file, scheduler, PDF, dan transport pesan dijalankan aplikasi lokal.

| Koleksi | Isi penting dan invariant |
| --- | --- |
| `accounts` dan `sessions` | Akun pemilik, hash password, hash token sesi, expiry dan revocation yang diperiksa backend |
| `business_profiles` | Owner, identitas bisnis, timezone, penandatangan |
| `clients` | Owner, nama, nomor E.164 dan preferensi komunikasi |
| `invoice_sequences` dan `invoice_numbers` | Counter owner/periode dan reservasi nomor dengan ID deterministik, ditulis dalam transaksi |
| `invoices` | Owner, client ID, tanggal, status order, versi data dan ringkasan pembayaran yang tervalidasi |
| `invoice_items` | Item nota yang ditautkan melalui invoice ID dan owner |
| `payments` | Ledger, verifikasi, reversal, actor, waktu, idempotency key dan alasan |
| `invoice_revisions` | Snapshot immutable yang dibatasi ukurannya, signature version, file ID dan checksum |
| `signature_assets` dan `file_assets` | Metadata file lokal, owner, versi, path relatif terkontrol dan checksum |
| `delivery_approvals` | Revisi, penerima, hash caption/PDF, owner, masa berlaku |
| `deliveries` | Outbox, jadwal, lease owner, lease expiry, fencing token dan attempt count |
| `delivery_keys` | ID deterministik dari identitas pengiriman, dibuat bersama approval dan outbox |
| `delivery_attempts` dan `delivery_events` | Hasil transport dan receipt yang dideduplikasi |
| `agent_bindings`, `task_links`, `office_preferences` | Relasi profil, proyeksi task serta preferensi visual |
| `audit_events` | Actor, record terkait, waktu dan ringkasan perubahan |

Setiap dokumen bisnis membawa `owner_id` dan `schema_version`. Application memverifikasi relasi owner dan referensi dokumen dalam transaksi yang relevan. Query menggunakan filter owner, pagination serta composite index sesuai pola akses. Batasi ukuran snapshot di bawah limit dokumen Firestore dan batasi jumlah item yang dapat diterbitkan secara atomik. File biner disimpan pada disk lokal, sedangkan Firestore menyimpan metadata. [Model Firestore](https://firebase.google.com/docs/firestore/data-model).

### 11.2 Login dan kontrol akses

Login milik aplikasi berjalan di backend Node.js. Akun pemilik dibuat melalui proses bootstrap lokal, dengan password hash memakai scrypt dan salt acak. Simpan record akun dan hash token sesi sebagai data Firestore. Cookie sesi acak memakai HttpOnly, SameSite=Strict, rotasi saat login, batas kedaluwarsa, serta pencabutan saat logout. Backend memeriksa expiry pada setiap request. Untuk HTTP localhost, kebijakan cookie mengikuti mode development, dan atribut Secure diaktifkan ketika menggunakan HTTPS. Mutasi memakai validasi Origin dan token CSRF, sedangkan login memakai pembatasan percobaan. Identitas owner diturunkan dari sesi server.

- Browser mengakses API backend lokal. Respons API berisi DTO yang sudah disaring.
- Firebase Security Rules menolak seluruh akses client langsung. Admin SDK menggunakan IAM dan melewati Security Rules, sehingga backend wajib memeriksa session, owner, scope dan ID pada setiap akses.
- Credential Firestore, token Hermes, auth state Baileys, dan password material privat berada server-side dengan hak file terbatas.
- Akun yang berhasil login harus tercatat sebagai pemilik yang diizinkan aplikasi.
- SSE memeriksa sesi dan owner saat tersambung, menutup stream saat sesi kedaluwarsa/dicabut, dan membatasi event pada pemilik tersebut.

IAM membatasi akses server ke Firestore. Rules menjadi penghalang akses client langsung. Otorisasi bisnis ditegakkan application layer karena server SDK memakai credential istimewa. [IAM Firestore](https://firebase.google.com/docs/firestore/security/iam), [Security Rules dan server SDK](https://firebase.google.com/docs/firestore/security/rules-conditions), [Admin SDK](https://firebase.google.com/docs/admin/setup).

### 11.3 Transaksi dan outbox

- Alokasi counter, reservasi nomor, snapshot metadata, dan audit yang terkait dilakukan secara atomik.
- Idempotency key request ditetapkan sebelum transaksi dan disimpan melalui dokumen ber-ID deterministik.
- Verifikasi payment serta perubahan ringkasan invoice berada dalam transaksi yang memeriksa versi dokumen.
- Claim worker membaca delivery, lease dan fencing token, lalu memperbaruinya dalam satu transaksi. Update hasil hanya sah dengan token claim yang berlaku.
- Callback transaksi hanya membaca dan menulis Firestore. Pengiriman WhatsApp, inference, penulisan file, serta perubahan state proses dilakukan setelah commit.
- Callback dapat diulang oleh SDK ketika ada konflik. Uji retry untuk memastikan satu intent bisnis menghasilkan satu dokumen logis.
- Batasi query job berdasarkan owner, status, waktu jatuh tempo dan jumlah hasil. Gunakan index serta backoff yang terukur.
- Sesudah kemungkinan send lalu timeout, state `unknown` masuk rekonsiliasi sebelum pengiriman ulang.

Firestore menyediakan transaksi atomik dengan retry saat konflik. Efek eksternal di luar transaksi mengikuti outbox dan bukti attempt. [Transaksi Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

### 11.4 Penyimpanan file lokal

- Root privat yang direncanakan adalah `data/private`, di luar folder aset web publik dan dikecualikan dari Git.
- Pisahkan file PDF, tanda tangan, dan bukti pembayaran berdasarkan owner dan versi.
- API menerima file ID. Backend memetakan ID ke path terkontrol dan menolak traversal, symlink escape, tipe serta ukuran tidak valid.
- Tulis file sementara, verifikasi checksum, lalu rename atomik pada volume yang sama sebelum menandai metadata `ready`.
- Preview dan unduh melalui endpoint backend terautentikasi. Respons memakai Content-Type yang sesuai dan Cache-Control privat.
- Revisi `rendering`, `ready`, atau `failed` memungkinkan pemulihan crash antara commit Firestore dan penulisan file.
- Rekonsiliasi mendeteksi file hilang, metadata tertunda dan artefak yatim. Penghapusan memakai grace period serta pemeriksaan referensi.
- Cadangkan file dan metadata sebagai satu set dengan manifest checksum. Snapshot backup dibuat saat worker bisnis dikondisikan tenang untuk menjaga konsistensi.

### 11.5 Pembaruan live

Backend mendengarkan perubahan dokumen melalui Firestore listener dan meneruskan event terpilih ke SSE lokal. Putuskan listener ketika pengguna keluar atau stream tidak diperlukan. Setelah reconnect, baca ulang snapshot melalui API. Saat internet terputus, tampilkan data terakhir beserta status stale dan tahan mutasi keuangan sampai database tersedia. [Firestore listener](https://firebase.google.com/docs/firestore/query-data/listen).

## 12. Performa, biaya, dan operasional

### 12.1 Anggaran performa awal

Target ini harus dibuktikan lewat prototype pada laptop pengguna.

- Kantor awal memuat 4 humanoid aktif, satu lantai, serta satu kamera.
- Target 45–60 FPS pada RTX 3050 dengan kualitas medium. Target mode hemat sekurangnya 30 FPS.
- Mulai dari DPR maksimal 1,5, bayangan terbatas, pencahayaan baked, dan tekstur 1K.
- Target payload scene pertama di bawah 20 MB terkompresi. Scene tambahan dimuat sesuai kebutuhan.
- Instancing dipakai untuk furnitur berulang. Skeletal character menggunakan instance rig yang benar.
- Saat modal formulir mendominasi layar, turunkan kualitas atau hentikan render scene yang tertutup.
- Reduced motion dan pilihan kualitas manual tersedia.
- Bila WebGL gagal, akses nota, pembayaran, WhatsApp, dan Kanban tetap tersedia melalui panel HTML.
- Target PDF normal selesai di bawah 5 detik setelah Chromium siap. Cold start diukur terpisah.

R3F mendukung reuse aset, instancing, level of detail, dan adaptasi kualitas. On-demand rendering digunakan ketika scene benar-benar diam, sedangkan animasi aktif tetap meminta frame. [R3F performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance).

### 12.2 Biaya development

| Komponen | Rencana |
| --- | --- |
| Aplikasi localhost | Laptop pengguna, listrik, internet dan ruang disk |
| Cloud Firestore | Pantau read, write, delete, ukuran database, index dan transfer sesuai paket project |
| PDF, tanda tangan, bukti pembayaran | Penyimpanan privat pada disk lokal dan salinan backup |
| Baileys | Library open-source, nomor WhatsApp dan proses lokal |
| Hermes inference | Provider model pengguna, dengan usage serta budget yang ditinjau |
| Aset 3D | Pilih paket berlisensi yang sesuai kebutuhan dan hasil benchmark |

Firebase pada rancangan ini digunakan hanya untuk database. Periksa kuota dan billing project Firestore sebelum mengaktifkan layanan berbayar. Batasi listener dan polling agar penggunaan terukur. [Biaya Firestore](https://firebase.google.com/docs/firestore/pricing).

Chromium PDF, login, sesi aplikasi, cron Hermes, worker outbox, penyimpanan file, serta Baileys berjalan pada host lokal. Koneksi internet dibutuhkan untuk Firestore cloud, WhatsApp, dan provider model.

### 12.3 Menjalankan dari localhost

- Development memakai Vite dan backend dengan port yang diperiksa tersedia.
- Port Hermes 8642 dipertahankan sebagai alamat runtime yang terdeteksi. Port bridge harus dibaca dari profil terpilih.
- Mode penggunaan harian memakai build frontend yang dilayani backend.
- Proses background Windows dibuat tersembunyi dengan autostart saat login jika diaktifkan pemilik.
- Health panel memperlihatkan Firebase Cloud Firestore, Hermes, router model, renderer PDF, dan WhatsApp sebagai status terpisah.
- Sleep atau mati menghentikan pengiriman dan eksekusi lokal. Jadwal tertunda ditinjau saat host kembali aktif.
- Backup mencakup database, file lokal privat, signature, konfigurasi aplikasi, dan state Hermes yang relevan.
- Restore diuji pada salinan terisolasi. Target awal pemulihan data maksimal kehilangan satu hari jika memakai backup harian.

### 12.4 Validasi lingkungan development localhost

1. Bind web, backend, gateway dan bridge ke loopback yang dipilih secara eksplisit.
2. Pastikan origin web lokal dan proxy API konsisten, dengan port yang tersedia.
3. Verifikasi session, CSRF dan kontrol akses QR/file pada localhost.
4. Uji koneksi outbound backend ke project Firestore development melalui IAM yang tepat.
5. Verifikasi credential tetap server-side dan root file privat terlindungi dari static serving.
6. Uji internet putus, database tidak tersedia, laptop sleep, dan restart worker.
7. Pulihkan file lokal beserta metadata database pada lingkungan uji terisolasi.
8. Catat aplikasi sebagai development localhost pada README, PRD, TODO dan panel status aplikasi.

T24 menjadi task verifikasi batas akses lokal dan konfigurasi development. Publikasi aplikasi memerlukan keputusan produk tersendiri di kemudian hari.

## 13. Tahapan implementasi dan kriteria selesai

### Fase 0 — fondasi dan bukti integrasi, estimasi 1–2 hari

- Buat repository aplikasi khusus dan dependency lockfile.
- Terapkan composition root, batas modul, dan aturan import sesuai multi-layered architecture pada bagian 4.4–4.8.
- Tentukan project Firebase Cloud Firestore yang memang untuk aplikasi ini.
- Audit diff API Hermes, profil kantor, dan autentikasi endpoint.
- Pair WhatsApp dan uji PDF sintetis ke nomor pemilik.
- Buat spike 3D satu ruangan dengan satu humanoid berjalan dan duduk.
- Catat hasil benchmark serta gap bridge receipt dan auth persistence.

Selesai ketika API Hermes terautentikasi, satu inference pendek berhasil, PDF uji terkirim, dan humanoid tampil dengan animasi benar.

### Fase 1 — nota siap dipakai, estimasi 3–5 hari

- Auth pemilik, profil bisnis, klien, kategori, nota, dan ledger pembayaran.
- Signature upload/draw, preview PDF, snapshot revisi, nomor atomik.
- Outbox, approval, pengiriman Baileys, deduplikasi, dan hasil unknown.
- Uji auth persistence sebelum menggunakan data transaksi nyata secara rutin.
- Panel HTML nota dan WhatsApp tersedia untuk pekerjaan harian.

Selesai ketika satu nota baru tanpa deadline dapat dibuat, ditandatangani, dan diterima sebagai PDF pada nomor uji.

### Fase 2 — kantor 3D operasional, estimasi 4–7 hari

- Denah satu lantai, empat humanoid, kamera, pencahayaan, label dan activity bubble.
- Meja nota, printer, lemari, papan, dan meja komunikasi membuka fitur terkait.
- Navigasi karakter, duduk, mengetik, idle, dan reservasi objek.
- Mode hemat, reduced motion, tampilan mobile, dan akses keyboard.

Selesai ketika alur membuat nota dapat dimulai dari kantor dan status visual mengikuti event backend.

### Fase 3 — lead Hermes, Kanban, dan cron, estimasi 3–5 hari

- Profil lead scoped, tool bisnis terbatas, dan percakapan terhubung.
- Board `synectra-office`, dependency, review, dan sinkronisasi event.
- Briefing terjadwal, missed-run handling, pembatasan concurrency, dan usage.
- Approval yang terikat dokumen serta batas akses tool teruji.

Selesai ketika Hermes menyiapkan draft, menjalankan satu task board, dan menjalankan satu cron uji dengan event tercatat.

### Fase 4 — penguatan dan simulasi lanjut, estimasi 3–6 hari

- Receipt delivered/read bila jalur bridge telah tersedia dan teruji.
- Crash recovery, restore backup, penanganan logout, serta upgrade dependency terkontrol.
- Variasi idle, rapat, avatar customization, audio, dan dekorasi.
- Optimasi GPU/CPU berdasarkan profiling.
- Panduan menjalankan harian dan pemulihan singkat di dalam aplikasi.

Selesai ketika skenario kegagalan utama lulus dan kantor nyaman dipakai selama satu sesi kerja panjang.

Total indikatif 14–25 hari kerja untuk implementasi, integrasi, dan pengujian oleh satu pengembang dibantu agent. Pembuatan aset manusia khusus atau perubahan besar bridge dapat menambah waktu. Durasi final dikalibrasi setelah fase 0.

## 14. Pengujian penerimaan

### Nota dan data

- [ ] Nomor nota unik saat dua tab menerbitkan bersamaan.
- [ ] Semua form dan PDF nota baru memenuhi permintaan tanpa deadline.
- [ ] Judul panjang dan 30 pembayaran menghasilkan PDF yang terbaca.
- [ ] Signature dan nilai pada PDF sesuai snapshot yang disetujui.
- [ ] Revisi baru mempertahankan PDF lama untuk audit.
- [ ] DP, pelunasan, reversal, serta kelebihan bayar dihitung benar.
- [ ] User berbeda gagal membaca atau mengubah nota, file, dan payment pemilik.
- [ ] Kegagalan penyimpanan file tidak menghasilkan revisi ready dengan file hilang.

### WhatsApp dan recovery

- [ ] PDF diterima sebagai dokumen dengan nama dan MIME yang benar.
- [ ] Nomor penerima tervalidasi sebelum approval.
- [ ] Double-click menghasilkan satu pengiriman logis.
- [ ] Revisi, penerima, atau caption berubah membatalkan approval lama.
- [ ] Restart saat antrean belum dikirim melanjutkan pekerjaan tepat sekali secara internal.
- [ ] Timeout setelah send menjadi unknown dan membutuhkan rekonsiliasi.
- [ ] Logout menghentikan pengiriman dan menampilkan pairing diperlukan.
- [ ] Status delivered/read hanya muncul setelah receipt valid.
- [ ] Inbound queue memiliki satu consumer sehingga pesan tetap diterima pemilik yang benar.
- [ ] Uji putus koneksi dan restart memastikan credential serta Signal keys konsisten.

### Hermes dan cron

- [ ] Setiap operasi board memakai board dan profil yang benar.
- [ ] Data invoice atau pesan klien yang berisi instruksi tidak mengubah izin tool.
- [ ] Lead membuat draft lewat tool yang tervalidasi.
- [ ] Agent gagal melewati approval pengiriman dan verifikasi pembayaran.
- [ ] Cron memakai WIB yang benar, run identity, timeout, dan kebijakan missed-run.
- [ ] Gateway offline ditampilkan sebagai offline atau stale.
- [ ] Task blocked memuat alasan yang dapat ditindaklanjuti.

### Visual

- [ ] Karakter tampak manusia, memiliki rig, serta berjalan dan duduk dengan benar.
- [ ] Klik objek membuka fitur yang tepat.
- [ ] Dua karakter tidak memakai kursi yang sama bersamaan.
- [ ] Idle dekoratif tetap sesuai status kerja yang diketahui.
- [ ] Target FPS diukur pada Intel UHD dan RTX 3050 yang tersedia.
- [ ] Tab tersembunyi berhenti menganimasikan scene.
- [ ] Keyboard, mode tenang, dan panel fallback berfungsi.

## 15. Hal yang masih harus dipastikan sebelum pembangunan

1. Project Firestore cloud dan akun pemilik aplikasi yang akan dipakai. Skema dan kuota project aktual belum diaudit.
2. Nama bisnis final dan nama penandatangan. Default sementara mengikuti SYNECTRA pada invoice.
3. Nomor WhatsApp yang dipair sebagai nomor bisnis.
4. File tanda tangan asli atau persetujuan hasil ekstraksi dari PDF.
5. Kredensial scoped dan kemampuan inference Hermes melalui router lokal.
6. Jalur receipt dan auth persistence untuk tingkat keandalan yang diinginkan.
7. Model manusia yang dipilih dari paket tersedia dan kualitas visual pada prototype.
8. Batas biaya model serta jadwal briefing yang diinginkan.

Planning sudah dapat dipakai untuk memulai fase fondasi. Keputusan akun, nomor, dan credential diselesaikan saat implementasi memerlukannya.

## 16. Catatan kualitas riset dan peta sumber

Riset menggunakan dokumentasi primer serta source Hermes yang terpasang. Rancangan Firestore database-only diperiksa pada dokumentasi Firebase tanggal 5 November 2026. Pemeriksaan online dilakukan 3 November 2026. URL dokumentasi Baileys lama memberi 404, sehingga rujukan dialihkan ke struktur dokumentasi aktif. Harga cloud dan kompatibilitas protokol harus diperiksa kembali ketika deployment dilakukan.

| Bidang | Temuan yang dipakai | Sumber |
| --- | --- | --- |
| Hermes API | HTTP API, streaming, autentikasi dan capability | [Dokumentasi API](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) |
| Hermes cron | Job terjadwal dan script-only | [Dokumentasi cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) |
| Hermes Kanban | Board durable, dispatcher, dependency, dan review | [Dokumentasi Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban) |
| Hermes WhatsApp | Bridge Baileys, pairing, pemisahan profil | [Dokumentasi WhatsApp](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp) |
| Baileys auth | Credential, Signal keys, dan batas helper multifile | [Session management](https://baileys.wiki/authentication/session-management) |
| Baileys media | Attachment dari buffer, stream, dan URL | [Media messages](https://baileys.wiki/messaging/media-messages) |
| Baileys status | Event koneksi dan perubahan pesan | [Events](https://baileys.wiki/concepts/events) |
| Keamanan Firestore | IAM server dan penolakan akses client | [IAM](https://firebase.google.com/docs/firestore/security/iam), [Rules](https://firebase.google.com/docs/firestore/security/rules-conditions) |
| Transaksi Firestore | Counter, dedupe dan claim worker lokal | [Transaksi](https://firebase.google.com/docs/firestore/manage-data/transactions) |
| Firestore cloud | Database pada layanan cloud dan SDK server | [Admin SDK](https://firebase.google.com/docs/admin/setup), [Biaya](https://firebase.google.com/docs/firestore/pricing) |
| Renderer PDF | PDF melalui CSS print | [Playwright](https://playwright.dev/docs/api/class-page#page-pdf) |
| Kantor 3D | Optimasi scene dan animasi humanoid | [R3F](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [SkeletonUtils](https://threejs.org/docs/pages/module-SkeletonUtils.html) |
| Aset manusia | Basis karakter dan animasi berlisensi | [Karakter](https://quaternius.com/packs/universalbasecharacters.html), [Animasi](https://quaternius.com/packs/universalanimationlibrary.html) |

Source lokal yang mendasari temuan khusus instalasi

- [Bridge WhatsApp](C:/Users/khair/AppData/Local/hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js).
- [Dependency bridge](C:/Users/khair/AppData/Local/hermes/hermes-agent/scripts/whatsapp-bridge/package.json).
- [Adapter WhatsApp](C:/Users/khair/AppData/Local/hermes/hermes-agent/plugins/platforms/whatsapp/adapter.py).
- [API server lokal](C:/Users/khair/AppData/Local/hermes/hermes-agent/gateway/platforms/api_server.py).
- [Dokumentasi Kanban lokal](C:/Users/khair/AppData/Local/hermes/hermes-agent/website/docs/user-guide/features/kanban.md).

