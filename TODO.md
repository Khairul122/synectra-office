# TODO T23 — Kembangkan avatar, suasana, kolam, dan ruang tambahan

- [x] Kustomisasi avatar persisten (`hairStyle`, `hairColor`, `outfitStyle`, `outfitColor`, `accessory`, `accentColor`) disimpan di `localStorage` dengan validasi fallback aman.
- [x] Siklus suasana 3 fase (`day`, `sunset`, `night`) terhubung dengan overlay visual kanvas dan preset audio.
- [x] Sintesis audio Web Audio API opt-in tanpa dependensi file statis, mute otomatis pada mode tenang, dan kontrol volume ter-clamp [0, 1].
- [x] Render teras kolam koordinat `[710, 910]` dengan aksen air turquoise tepat `#388DA7` memenuhi batas performa (draw calls <= 5, DPR clamp <= 1.5, frame pacing 100ms quiet mode).
- [x] Katalog ekspansi ruangan (teras kolam, studio kreatif, gaming room) dengan metadata estimasi budget render.
- [x] Dialog modal kustomisasi avatar dan katalog ekspansi dengan standar aksesibilitas (`aria-labelledby`, dialog ref, focus trap, styling chips).
- [x] Validasi test suite `avatar-customization-atmosphere.test.mjs` (8/8 lulus) serta seluruh test workspace (107/107 lulus).
- [x] Pemeriksaan statis monorepo lulus (`pnpm typecheck`).
