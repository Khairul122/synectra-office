import { buildApp } from './bootstrap/app';
import { readConfig } from './bootstrap/config';
import { WhatsappService } from './modules/whatsapp/application/whatsapp-service';
import { BridgeManager } from './modules/whatsapp/infrastructure/bridge-manager';
import { createCalendarScheduler } from './modules/calendar/application/calendar-scheduler';
import { defaultHermesCliRunner } from './infrastructure/hermes-cli';
import { createReceiptWorker } from './modules/deliveries/application/receipt-worker';
import { createOwnerCommandWorker, OWNER_DAILY_REPORT_SCRIPT, runOwnerDailyReport } from './modules/office/application/owner-work-report';
import { getAppJobExecutor, setAppJobExecutor } from './modules/calendar/application/calendar-service';

try {
  const config = readConfig(process.env);
  const calendarScheduler = createCalendarScheduler();
  const whatsappService = new WhatsappService(new BridgeManager());
  const receiptWorker = createReceiptWorker(whatsappService);
  const ownerCommandWorker = createOwnerCommandWorker(whatsappService);
  const app = buildApp({
    whatsappService,
    onReceiptQueued: () => { void receiptWorker.runOnce().catch(() => undefined); },
    whatsappOwnerKey: config.whatsappOwnerKey,
    calendarScheduler,
    hermesHealthProbe: true,
    hermesAgentRunner: defaultHermesCliRunner
  });

  const appJobs = getAppJobExecutor();
  setAppJobExecutor(input => input.schedule.script === OWNER_DAILY_REPORT_SCRIPT ? runOwnerDailyReport(whatsappService, input.ownerId) : appJobs(input));

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down server gracefully...');
    receiptWorker.stop();
    ownerCommandWorker.stop();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during server shutdown');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => { shutdown('SIGINT'); });
  process.once('SIGTERM', () => { shutdown('SIGTERM'); });

  calendarScheduler.start();
  receiptWorker.start();
  ownerCommandWorker.start();
  await app.listen(config);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Server failed to start');
  process.exitCode = 1;
}
