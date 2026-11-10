import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auth, authConfigurationError, signInWithGoogle } from '../src/firebase.ts';

test('missing Firebase configuration does not crash startup or allow sign-in', async () => {
  assert.equal(auth, null);
  assert.match(authConfigurationError, /VITE_FIREBASE_API_KEY/);
  await assert.rejects(signInWithGoogle(), /Login belum dikonfigurasi/);
});
