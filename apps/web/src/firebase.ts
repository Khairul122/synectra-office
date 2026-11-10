import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from 'firebase/auth';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export let auth: Auth | null = null;
export let authConfigurationError: string | null = null;

if (!env.VITE_FIREBASE_API_KEY?.trim() || env.VITE_FIREBASE_API_KEY.startsWith('replace-with-')) {
  authConfigurationError = 'Login belum dikonfigurasi. Isi VITE_FIREBASE_API_KEY pada .env di folder utama proyek, lalu mulai ulang server web.';
} else {
  try {
    const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'synectra-office.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'synectra-office',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'synectra-office.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '1024708303598',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:1024708303598:web:b72b89f084bfd1b918b1ff',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-0KEK1TRLG4'
    });
    auth = getAuth(app);
    // Dev/E2E lokal saja: login ke Firebase Auth Emulator, bukan project asli.
    if (env.VITE_FIREBASE_AUTH_EMULATOR_HOST) connectAuthEmulator(auth, `http://${env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  } catch {
    authConfigurationError = 'Konfigurasi login Firebase tidak valid. Periksa konfigurasi Firebase Web pada .env, lalu mulai ulang server web.';
  }
}
const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  if (!auth) throw new Error(authConfigurationError ?? 'Login tidak tersedia.');
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}

export { signOut };
