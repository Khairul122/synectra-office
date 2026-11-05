# Task pelaksanaan Synectra office

> Status produk masih development. Web, backend, Hermes, dan Baileys berjalan di localhost. Firebase cloud digunakan hanya untuk database Cloud Firestore. Login dikelola backend dan file disimpan lokal.

Dibentuk dari TODO.md proyek pada 5 November 2026. Setiap file memuat satu task beserta status, dependensi, tujuan, input, langkah kerja, kriteria selesai, dan bukti yang harus dikumpulkan.

## Urutan pengerjaan

1. T02 selesai; lanjutkan T03 yang sudah memiliki implementasi parsial.
2. T04 dan T05 dapat dimulai berdasarkan catatan T01 yang selesai.
3. Kerjakan task berikutnya setelah dependensinya memenuhi kriteria selesai.
4. Catat bukti serta status aktual pada file task, kemudian selaraskan ringkasan TODO.md.
5. Jadwalkan T23 sesuai prioritas visual dan gunakan T24 untuk memverifikasi batas development localhost.

Status awal mengikuti TODO.md. Bukti historis T01/T02 berada pada catatan pelaksanaan di root proyek. Tautan catatan tersebut tersedia pada task terkait.

## Daftar task

| Task | Tujuan pekerjaan | Status awal | Dependensi |
| --- | --- | --- | --- |
| [T01](D:/portofolio/synectra-office/tasks/T01.md) | Siapkan fondasi proyek dan arsitektur berlapis | `done` | Dapat dimulai |
| [T02](D:/portofolio/synectra-office/tasks/T02.md) | Verifikasi runtime, profil, dan autentikasi Hermes | `done` | [T01](D:/portofolio/synectra-office/tasks/T01.md) |
| [T03](D:/portofolio/synectra-office/tasks/T03.md) | Buktikan pairing dan pengiriman PDF lewat bridge Baileys | `review` | [T02](D:/portofolio/synectra-office/tasks/T02.md) |
| [T04](D:/portofolio/synectra-office/tasks/T04.md) | Uji satu ruangan dan humanoid pada perangkat pengguna | `todo` | [T01](D:/portofolio/synectra-office/tasks/T01.md) |
| [T05](D:/portofolio/synectra-office/tasks/T05.md) | Siapkan Firestore cloud, login backend, dan file lokal privat | `todo` | [T01](D:/portofolio/synectra-office/tasks/T01.md) |
| [T06](D:/portofolio/synectra-office/tasks/T06.md) | Bangun profil bisnis, kategori, dan data klien | `todo` | [T05](D:/portofolio/synectra-office/tasks/T05.md) |
| [T07](D:/portofolio/synectra-office/tasks/T07.md) | Bangun nota, nomor atomik, dan snapshot revisi | `todo` | [T06](D:/portofolio/synectra-office/tasks/T06.md) |
| [T08](D:/portofolio/synectra-office/tasks/T08.md) | Bangun ledger pembayaran, verifikasi, dan reversal | `todo` | [T07](D:/portofolio/synectra-office/tasks/T07.md) |
| [T09](D:/portofolio/synectra-office/tasks/T09.md) | Bangun tanda tangan, preview, dan PDF nota versi final | `todo` | [T07](D:/portofolio/synectra-office/tasks/T07.md), [T08](D:/portofolio/synectra-office/tasks/T08.md) |
| [T10](D:/portofolio/synectra-office/tasks/T10.md) | Bangun approval, antrean durable, dan recovery pengiriman | `todo` | [T09](D:/portofolio/synectra-office/tasks/T09.md) |
| [T11](D:/portofolio/synectra-office/tasks/T11.md) | Hubungkan pengiriman PDF dan status WhatsApp ke web | `todo` | [T03](D:/portofolio/synectra-office/tasks/T03.md), [T10](D:/portofolio/synectra-office/tasks/T10.md) |
| [T12](D:/portofolio/synectra-office/tasks/T12.md) | Bangun denah kantor, kamera, pencahayaan, dan navigasi layar | `todo` | [T04](D:/portofolio/synectra-office/tasks/T04.md), [T06](D:/portofolio/synectra-office/tasks/T06.md) |
| [T13](D:/portofolio/synectra-office/tasks/T13.md) | Bangun empat humanoid, animasi, dan reservasi objek | `todo` | [T12](D:/portofolio/synectra-office/tasks/T12.md) |
| [T14](D:/portofolio/synectra-office/tasks/T14.md) | Hubungkan objek kantor dengan nota, klien, dan pengiriman | `todo` | [T11](D:/portofolio/synectra-office/tasks/T11.md), [T13](D:/portofolio/synectra-office/tasks/T13.md) |
| [T15](D:/portofolio/synectra-office/tasks/T15.md) | Bangun idle, aktivitas karakter, dan sinkronisasi status kerja | `todo` | [T14](D:/portofolio/synectra-office/tasks/T14.md) |
| [T16](D:/portofolio/synectra-office/tasks/T16.md) | Bangun percakapan Hermes dan tool bisnis dengan izin terbatas | `todo` | [T02](D:/portofolio/synectra-office/tasks/T02.md), [T06](D:/portofolio/synectra-office/tasks/T06.md), [T07](D:/portofolio/synectra-office/tasks/T07.md), [T09](D:/portofolio/synectra-office/tasks/T09.md), [T10](D:/portofolio/synectra-office/tasks/T10.md) |
| [T17](D:/portofolio/synectra-office/tasks/T17.md) | Bangun Kanban kantor dengan board native Hermes | `todo` | [T16](D:/portofolio/synectra-office/tasks/T16.md), [T14](D:/portofolio/synectra-office/tasks/T14.md) |
| [T18](D:/portofolio/synectra-office/tasks/T18.md) | Bangun cron, kalender kerja, dan kebijakan missed-run | `todo` | [T17](D:/portofolio/synectra-office/tasks/T17.md), [T11](D:/portofolio/synectra-office/tasks/T11.md) |
| [T19](D:/portofolio/synectra-office/tasks/T19.md) | Perkuat persistence Baileys dan bukti delivery/read receipt | `todo` | [T11](D:/portofolio/synectra-office/tasks/T11.md) |
| [T20](D:/portofolio/synectra-office/tasks/T20.md) | Uji isolasi akses, crash recovery, dan pemulihan backup | `todo` | [T18](D:/portofolio/synectra-office/tasks/T18.md), [T19](D:/portofolio/synectra-office/tasks/T19.md) |
| [T21](D:/portofolio/synectra-office/tasks/T21.md) | Optimalkan kantor, tampilan mobile, dan aksesibilitas | `todo` | [T15](D:/portofolio/synectra-office/tasks/T15.md), [T17](D:/portofolio/synectra-office/tasks/T17.md), [T18](D:/portofolio/synectra-office/tasks/T18.md) |
| [T22](D:/portofolio/synectra-office/tasks/T22.md) | Siapkan penggunaan development localhost dan validasi seluruh alur | `todo` | [T20](D:/portofolio/synectra-office/tasks/T20.md), [T21](D:/portofolio/synectra-office/tasks/T21.md) |
| [T23](D:/portofolio/synectra-office/tasks/T23.md) | Kembangkan avatar, suasana, kolam, dan ruang tambahan | `todo` | [T22](D:/portofolio/synectra-office/tasks/T22.md) |
| [T24](D:/portofolio/synectra-office/tasks/T24.md) | Validasi batas development localhost dan koneksi database cloud | `todo` | [T22](D:/portofolio/synectra-office/tasks/T22.md) |

## Referensi

- [PRD](D:/portofolio/synectra-office/PRD.md).
- [TODO keseluruhan](D:/portofolio/synectra-office/TODO.md).
- [Planning detail](D:/portofolio/synectra-office/PLANNING_WEB_NOTA_KANTOR_3D.md).
- [Konsep visual](D:/portofolio/synectra-office/synectra-office-concept-v1.png).

Paket task ini merupakan rincian pelaksanaan. Pengujian runtime dan penerimaan WhatsApp dicatat pada task saat dijalankan.
