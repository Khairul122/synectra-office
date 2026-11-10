// Tunggu API server menerima koneksi sebelum Vite dijalankan, agar proxy tidak membanjiri log dengan ECONNREFUSED.
import { connect } from 'node:net';

const host = process.env.APP_HOST || '127.0.0.1';
const port = Number(process.env.APP_PORT) || 3000;
const deadline = Date.now() + 60_000;

function tryConnect() {
  const socket = connect({ host, port });
  socket.once('connect', () => { socket.destroy(); process.exit(0); });
  socket.once('error', () => {
    socket.destroy();
    if (Date.now() > deadline) {
      console.warn(`[wait] server ${host}:${port} belum siap setelah 60 detik, Vite tetap dijalankan.`);
      process.exit(0);
    }
    setTimeout(tryConnect, 300);
  });
}

tryConnect();
