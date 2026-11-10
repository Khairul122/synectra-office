# Aset kantor isometrik 2.5D

Aset baru dibuat dengan imagegen bawaan. Peta dan karakter adalah ilustrasi 2D baru, bukan hasil render ulang model kantor lama. File yang digunakan aplikasi berada di `apps/web/public/assets/office2d`.

## Isi paket

- `map.png`: peta kantor 1536 × 1024 piksel dengan sudut isometrik tetap.
- `owner.png`, `hermes.png`, `admin.png`, `communication.png`: masing-masing berisi lima pose dalam satu baris: diam, berjalan, duduk/mengetik, minum, dan istirahat.
- Setiap karakter memiliki `-walk.png` dan `-work.png` dengan empat frame berjalan dan mengetik. Tiap lembar karakter berukuran 2172 × 724 piksel dan memiliki kanal transparansi.

Scene memakai Canvas 2D. Pemilik dapat berjalan dari ruang pemilik ke pantry dan lounge, lalu kembali. Panel ketiga staf menyediakan pilihan pose visual di tempat. Aktivitas visual tidak menjalankan aksi bisnis. Peta adalah gambar datar, belum terdiri dari ubin atau properti yang dapat dipindahkan satu per satu. Arah berjalan memakai satu tampak dan pencerminan horizontal. Pose diam, minum, dan istirahat memakai satu gambar dengan gerakan ringan, bukan rangkaian frame terpisah.

## Menjalankan dan menguji

```powershell
cd D:\portofolio\synectra-office
pnpm --filter @synectra/web dev
pnpm --filter @synectra/web assets:check
```

Pratinjau tanpa layanan bisnis tersedia di `http://127.0.0.1:5173/scripts/assets/preview.html`.

## Ringkasan prompt gambar

Peta: kantor ilustrasi 2D yang lebih luas dengan denah berbentuk berlian pada kamera isometrik ortografik; ruang pemilik, ruang rapat, enam workstation, pantry, lounge, arsip dan resepsionis; pintu pantry dan lounge terbuka, jalur lebar, dan latar terang bernuansa krem serta sage; tanpa orang atau teks.

Karakter: empat rekan fiktif Indonesia baru dalam gaya ilustrasi 2D hangat dengan sudut tiga perempat yang konsisten. Pemilik memakai overshirt teal dan celana oker; Hermes memakai blazer mustard dan celana navy; administrasi memakai hijab indigo, kacamata, dan blus dusty rose; komunikasi memakai kacamata, kardigan biru, dan celana olive. Masing-masing diminta dengan lima pose terpisah dan latar transparan.

Frame gerak: masing-masing karakter diminta dalam empat pose siklus berjalan dan empat pose mengetik, dengan identitas dan pakaian yang sama, ukuran seragam, serta latar transparan. Pose mengetik staf digambar dari belakang secara lurus agar sejajar dengan kursi dan meja.
