import { buildApp } from './bootstrap/app';
import { readConfig } from './bootstrap/config';
import { WhatsappService } from './modules/whatsapp/application/whatsapp-service';
import { BridgeManager } from './modules/whatsapp/infrastructure/bridge-manager';

try {
  const config = readConfig(process.env);
  const app = buildApp({
    whatsappService: new WhatsappService(new BridgeManager()),
    whatsappOwnerKey: config.whatsappOwnerKey
  });
  await app.listen(config);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Server failed to start');
  process.exitCode = 1;
}
