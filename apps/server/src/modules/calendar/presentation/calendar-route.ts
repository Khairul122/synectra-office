import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  getCalendarOverview,
  createSchedule,
  pauseSchedule,
  resumeSchedule,
  executeScheduleRun,
  processMissedRuns,
  resolveMissedRun,
  deleteSchedule
} from '../application/calendar-service';

type UserRequest = FastifyRequest & { userId?: string };

function owner(req: FastifyRequest): string | undefined {
  return (req as UserRequest).userId;
}

export function registerCalendarRoutes(app: FastifyInstance): void {
  // 1. Overview kalender, jadwal, riwayat run, & missed runs
  app.get('/api/calendar', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const overview = await getCalendarOverview(userId);
      return reply.code(200).send(overview);
    } catch (err: any) {
      return reply
        .code(err.statusCode || 500)
        .send({ error: err.message || 'Gagal memuat overview kalender' });
    }
  });

  // 2. Buat jadwal baru
  app.post('/api/calendar/schedules', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const schedule = await createSchedule(userId, req.body as any);
      return reply.code(201).send({ schedule });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Gagal membuat jadwal' });
    }
  });

  // 3. Pause jadwal
  app.delete('/api/calendar/schedules/:id', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try {
      await deleteSchedule(userId, id);
      return reply.code(204).send();
    } catch (err: any) {
      return reply.code(err.statusCode || 400).send({ error: err.message || 'Gagal menghapus jadwal' });
    }
  });

  app.post('/api/calendar/schedules/:id/pause', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const updated = await pauseSchedule(userId, id, body.reason);
      return reply.code(200).send({ schedule: updated });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Gagal menunda jadwal' });
    }
  });

  // 4. Resume jadwal
  app.post('/api/calendar/schedules/:id/resume', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try {
      const updated = await resumeSchedule(userId, id);
      return reply.code(200).send({ schedule: updated });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Gagal melanjutkan jadwal' });
    }
  });

  // 5. Eksekusi manual on-demand
  app.post('/api/calendar/schedules/:id/run', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    try {
      const run = await executeScheduleRun(userId, id);
      return reply.code(200).send({ run });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Gagal mengeksekusi jadwal' });
    }
  });

  // 6. Evaluasi dan proses missed-runs (misal host reconnect setelah laptop mati)
  app.post('/api/calendar/missed-runs/check', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      const result = await processMissedRuns(userId);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply
        .code(err.statusCode || 500)
        .send({ error: err.message || 'Gagal memeriksa missed runs' });
    }
  });

  // 7. Selesaikan missed run yang berstatus review
  app.post('/api/calendar/schedules/:id/resolve-missed', async (req, reply) => {
    const userId = owner(req);
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    const body = (req.body as { action: 'run' | 'skip' }) || { action: 'skip' };
    try {
      const schedule = await resolveMissedRun(userId, id, body.action);
      return reply.code(200).send({ schedule });
    } catch (err: any) {
      return reply
        .code(err.statusCode || 400)
        .send({ error: err.message || 'Gagal menyelesaikan missed run' });
    }
  });
}
