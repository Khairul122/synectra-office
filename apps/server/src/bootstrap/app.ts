import Fastify from 'fastify';
import { registerHealthRoute } from '../modules/health/presentation/health-route';
import { getHealth } from '../modules/health/application/get-health';
import { registerWhatsappRoutes } from '../modules/whatsapp/presentation/whatsapp-route';
import { WhatsappService } from '../modules/whatsapp/application/whatsapp-service';

export function buildApp(opts?: { whatsappService?: WhatsappService; whatsappOwnerKey?: string }) {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.secret',
          '*.token',
          'password',
          'secret',
          'token',
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

  registerHealthRoute(app, getHealth);

  if (opts?.whatsappService && opts.whatsappOwnerKey) {
    registerWhatsappRoutes(app, opts.whatsappService, opts.whatsappOwnerKey);
  }

  return app;
}
