@echo off
cd /d "%~dp0\.."
echo [Synectra Office] Menyiapkan environment localhost...

if not exist "apps\web\dist\index.html" (
  echo [Synectra Office] Build frontend belum tersedia. Membangun apps/web...
  call pnpm --filter @synectra/web build
)

echo [Synectra Office] Menjalankan server Fastify localhost...
call pnpm --filter @synectra/server dev
