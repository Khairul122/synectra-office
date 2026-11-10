import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import Fastify from 'fastify';
import { registerHealthRoute } from '../modules/health/presentation/health-route';
import { getHealth, getServicesHealth } from '../modules/health/application/get-health';
import { registerWhatsappRoutes } from '../modules/whatsapp/presentation/whatsapp-route';
import { WhatsappService } from '../modules/whatsapp/application/whatsapp-service';
import { registerAuthRoutes } from '../modules/auth/presentation/auth-route';
import { registerBusinessRoutes } from '../modules/business/presentation/business-route';
import { registerInvoiceRoutes } from '../modules/invoice/presentation/invoice-route';
import { registerPaymentRoutes } from '../modules/payment/presentation/payment-route';
import { registerPdfRoutes } from '../modules/invoice/presentation/pdf-route';
import { registerDeliveryRoutes } from '../modules/deliveries/presentation/delivery-route';
import { registerOfficeRoutes } from '../modules/office/presentation/office-route';
import { setOfficeStatusStore } from '../modules/office/application/office-event-service';
import { createOfficeStatusStore } from '../modules/office/infrastructure/office-status-store';
import { registerHermesRoutes } from '../modules/hermes/presentation/hermes-route';
import { setHermesModelClient, setHermesStore } from '../modules/hermes/application/hermes-service';
import { createRouterModelClient, type HermesModelClient } from '../infrastructure/hermes-model';
import { createHermesStore } from '../modules/hermes/infrastructure/hermes-store';
import { registerKanbanRoutes } from '../modules/kanban/presentation/kanban-route';
import {
  setHermesCliRunner,
  getHermesCliRunner,
  setTaskLinkStore,
  type HermesCliRunner,
  type TaskLinkStore
} from '../modules/kanban/application/kanban-service';
import { defaultHermesCliRunner } from '../infrastructure/hermes-cli';
import { createTaskLinkStore } from '../modules/kanban/infrastructure/task-link-store';
import { registerCalendarRoutes } from '../modules/calendar/presentation/calendar-route';
import {
  setCalendarStore,
  setHermesCronRunner,
  type CalendarStore,
  type HermesCronRunner
} from '../modules/calendar/application/calendar-service';
import { createCalendarStore } from '../modules/calendar/infrastructure/calendar-store';
import { type CalendarScheduler } from '../modules/calendar/application/calendar-scheduler';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function resolveDefaultWebDistDir(): string {
  const candidates = [
    resolve(process.cwd(), 'apps/web/dist'),
    resolve(process.cwd(), '../web/dist'),
    resolve(process.cwd(), 'dist')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function buildApp(opts?: {
  whatsappService?: WhatsappService;
  onReceiptQueued?: () => void;
  whatsappOwnerKey?: string;
  hermesRunner?: HermesCliRunner;
  taskLinkStore?: TaskLinkStore;
  hermesCronRunner?: HermesCronRunner;
  calendarStore?: CalendarStore;
  calendarScheduler?: CalendarScheduler;
  webDistDir?: string;
  chromiumPath?: string;
  hermesHealthProbe?: boolean;
  /** null = paksa parser deterministik; undefined = router dari env (HERMES_ROUTER_API_KEY). */
  hermesModelClient?: HermesModelClient | null;
}) {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-owner-key"]',
          'req.headers["X-Owner-Key"]',
          'headers.authorization',
          'headers["x-owner-key"]',
          'headers["X-Owner-Key"]',
          'password',
          'token',
          'secret',
          'apiKey',
          'api_key',
          'API_SERVER_KEY',
          'HERMES_API_KEY',
          'HERMES_ROUTER_API_KEY',
          '*.api_key',
          '*.API_SERVER_KEY',
          '*.HERMES_API_KEY',
          '*.HERMES_ROUTER_API_KEY'
        ],
        censor: '[Redacted]'
      }
    }
  });

  registerHealthRoute(
    app,
    getHealth,
    () => getServicesHealth({
      whatsappService: opts?.whatsappService,
      chromiumPath: opts?.chromiumPath,
      probeHermes: opts?.hermesHealthProbe
    })
  );
  registerAuthRoutes(app);
  registerBusinessRoutes(app);
  registerInvoiceRoutes(app);
  registerPaymentRoutes(app, opts?.onReceiptQueued);
  registerPdfRoutes(app);
  registerDeliveryRoutes(app, opts?.whatsappService);
  setOfficeStatusStore(createOfficeStatusStore());
  registerOfficeRoutes(app);
  setHermesStore(createHermesStore());
  setHermesModelClient(opts?.hermesModelClient !== undefined ? opts.hermesModelClient : createRouterModelClient());
  registerHermesRoutes(app);

  if (opts?.hermesRunner) {
    setHermesCliRunner(opts.hermesRunner);
  } else if (!getHermesCliRunner()) {
    setHermesCliRunner(defaultHermesCliRunner);
  }

  if (opts?.taskLinkStore) {
    setTaskLinkStore(opts.taskLinkStore);
  } else {
    setTaskLinkStore(createTaskLinkStore());
  }

  registerKanbanRoutes(app);

  if (opts?.hermesCronRunner) {
    setHermesCronRunner(opts.hermesCronRunner);
  } else {
    setHermesCronRunner(defaultHermesCliRunner);
  }

  if (opts?.calendarStore) {
    setCalendarStore(opts.calendarStore);
  } else {
    setCalendarStore(createCalendarStore());
  }

  registerCalendarRoutes(app);

  // Graceful shutdown hooks
  if (opts?.calendarScheduler) {
    app.addHook('onClose', async () => {
      opts.calendarScheduler?.stop();
    });
  }

  if (opts?.whatsappService) {
    app.addHook('onClose', async () => {
      try {
        opts.whatsappService?.disconnect();
      } catch {
        // ignore errors on close
      }
    });
  }

  if (opts?.whatsappService && opts.whatsappOwnerKey) {
    registerWhatsappRoutes(app, opts.whatsappService, opts.whatsappOwnerKey);
  }

  // Static serving with SPA fallback & path traversal protection
  app.setNotFoundHandler(async (request, reply) => {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      return reply.status(404).send({ error: 'Not Found' });
    }

    const urlPath = request.url.split('?')[0] || '/';

    const isApiPrefix = [
      '/api',
      '/health',
      '/auth',
      '/whatsapp'
    ].some((prefix) => urlPath === prefix || urlPath.startsWith(prefix + '/'));

    if (isApiPrefix) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    const webDist = opts?.webDistDir ?? resolveDefaultWebDistDir();
    if (!existsSync(webDist)) {
      return reply.status(404).send({ error: 'Web dist directory not found' });
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return reply.status(400).send({ error: 'Bad Request' });
    }

    // Path traversal protection: tolak upaya navigasi direktori relatif
    if (decoded.includes('..') || urlPath.includes('..') || urlPath.toLowerCase().includes('%2e')) {
      return reply.status(400).send({ error: 'Bad Request' });
    }

    const normalizedDist = resolve(webDist);
    let targetFile = resolve(webDist, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));

    // Security check: must not escape webDist
    if (!targetFile.startsWith(normalizedDist)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    if (existsSync(targetFile) && statSync(targetFile).isDirectory()) {
      targetFile = join(targetFile, 'index.html');
    }

    if (existsSync(targetFile) && statSync(targetFile).isFile()) {
      const ext = extname(targetFile).toLowerCase();
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
      const stream = createReadStream(targetFile);
      return reply.type(mime).send(stream);
    }

    // Jangan fallback ke HTML jika request memiliki file extension spesifik (misal .js, .png, .css)
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(decoded);
    if (hasFileExtension) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    // SPA Fallback: serve index.html untuk rute navigasi aplikasi
    const indexHtml = join(normalizedDist, 'index.html');
    if (existsSync(indexHtml) && statSync(indexHtml).isFile()) {
      const stream = createReadStream(indexHtml);
      return reply.type('text/html; charset=utf-8').send(stream);
    }

    return reply.status(404).send({ error: 'Not Found' });
  });

  return app;
}
