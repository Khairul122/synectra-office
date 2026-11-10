import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BridgeManager } from '../src/modules/whatsapp/infrastructure/bridge-manager';
import { WhatsappService } from '../src/modules/whatsapp/application/whatsapp-service';

test('T19: Baileys persistence integrity validation and recovery', () => {
  const tmpBase = path.resolve(process.cwd(), 'apps/server/.tmp', `test-wa-persistence-${Date.now()}`);
  const sessionDir = path.join(tmpBase, 'session');
  const backupDir = path.join(tmpBase, 'backup');

  try {
    // 1. Session directory does not exist -> unpaired & pairing_required
    const managerNoDir = new BridgeManager({ sessionDir, autoStart: false });
    const resNoDir = managerNoDir.validateAuthState();
    assert.equal(resNoDir.valid, false);
    assert.match(resNoDir.error ?? '', /pairing_required/);
    assert.equal(managerNoDir.getStatus().status, 'unpaired');

    // 2. Directory exists, but creds.json missing -> unpaired
    fs.mkdirSync(sessionDir, { recursive: true });
    const managerNoCreds = new BridgeManager({ sessionDir, autoStart: false });
    const resNoCreds = managerNoCreds.validateAuthState();
    assert.equal(resNoCreds.valid, false);
    assert.match(resNoCreds.error ?? '', /credentials not found/);
    assert.equal(managerNoCreds.getStatus().status, 'unpaired');

    // 3. 0-byte creds.json -> unpaired & pairing_required
    const credsFile = path.join(sessionDir, 'creds.json');
    fs.writeFileSync(credsFile, '');
    const managerEmptyCreds = new BridgeManager({ sessionDir, autoStart: false });
    const resEmptyCreds = managerEmptyCreds.validateAuthState();
    assert.equal(resEmptyCreds.valid, false);
    assert.match(resEmptyCreds.error ?? '', /creds\.json is empty/);
    assert.equal(managerEmptyCreds.getStatus().status, 'unpaired');

    // 4. Corrupted JSON creds.json -> unpaired & pairing_required
    fs.writeFileSync(credsFile, '{ corrupted json payload: [');
    const managerCorruptCreds = new BridgeManager({ sessionDir, autoStart: false });
    const resCorruptCreds = managerCorruptCreds.validateAuthState();
    assert.equal(resCorruptCreds.valid, false);
    assert.match(resCorruptCreds.error ?? '', /creds\.json corrupted/);
    assert.equal(managerCorruptCreds.getStatus().status, 'unpaired');

    // 5. Valid creds.json but corrupted Signal key file -> unpaired
    fs.writeFileSync(
      credsFile,
      JSON.stringify({
        noiseKey: { private: 'abc', public: 'def' },
        pairingEphemeralKeyPair: { private: '123', public: '456' },
        me: { id: '6281234567890:1@s.whatsapp.net', name: 'Synectra Bot' }
      })
    );
    const signalKeyFile = path.join(sessionDir, 'pre-key-1.json');
    fs.writeFileSync(signalKeyFile, ''); // 0-byte key

    const managerEmptyKey = new BridgeManager({ sessionDir, autoStart: false });
    const resEmptyKey = managerEmptyKey.validateAuthState();
    assert.equal(resEmptyKey.valid, false);
    assert.match(resEmptyKey.error ?? '', /signal key file pre-key-1\.json is empty/);
    assert.equal(managerEmptyKey.getStatus().status, 'unpaired');

    // 6. Valid creds.json and valid Signal keys -> valid, status connecting
    fs.writeFileSync(signalKeyFile, JSON.stringify({ keyId: 1, keyPair: { public: 'pub', private: 'priv' } }));
    const managerValid = new BridgeManager({ sessionDir, autoStart: false });
    const resValid = managerValid.validateAuthState();
    assert.equal(resValid.valid, true);
    assert.equal(managerValid.getStatus().status, 'connecting');

    const service = new WhatsappService(managerValid);
    assert.equal(service.getPairStatus().status, 'connecting');

    // 7. Backup session, wipe session, verify fallback to unpaired, then restore
    managerValid.backupSession(backupDir);
    assert.ok(fs.existsSync(path.join(backupDir, 'creds.json')));
    assert.ok(fs.existsSync(path.join(backupDir, 'pre-key-1.json')));

    managerValid.clearSession();
    assert.equal(managerValid.validateAuthState().valid, false);
    assert.equal(managerValid.checkInitialState(false), 'unpaired');

    // Restore from backup
    managerValid.restoreSession(backupDir);
    assert.equal(managerValid.validateAuthState().valid, true);
    assert.equal(managerValid.checkInitialState(false), 'connecting');
  } finally {
    if (fs.existsSync(tmpBase)) {
      fs.rmSync(tmpBase, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});
