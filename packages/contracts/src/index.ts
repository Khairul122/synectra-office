import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const whatsappConnectionStatusSchema = z.enum(['unpaired', 'pairing', 'connecting', 'connected', 'reconnecting', 'logged_out', 'error']);
export type WhatsappConnectionStatus = z.infer<typeof whatsappConnectionStatusSchema>;
export const whatsappPairStatusSchema = z.object({ status: whatsappConnectionStatusSchema, qrCode: z.string().optional(), user: z.object({ id: z.string().nullable(), name: z.string().nullable() }).optional(), error: z.string().optional() });
export type WhatsappPairStatus = z.infer<typeof whatsappPairStatusSchema>;
export const whatsappSendPdfResponseSchema = z.object({ success: z.boolean(), deliveryStatus: z.enum(['sent', 'unknown', 'failed']), messageId: z.string().optional(), fileName: z.string().optional(), mimeType: z.string().optional(), error: z.string().optional() });
export type WhatsappSendPdfResponse = z.infer<typeof whatsappSendPdfResponseSchema>;

export function normalizeIndonesianPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  if (compact.startsWith('+62')) return `62${compact.slice(3)}`;
  if (compact.startsWith('62')) return compact;
  if (compact.startsWith('0')) return `62${compact.slice(1)}`;
  throw new Error('Nomor WhatsApp Indonesia tidak valid');
}
/** String opsional dari form: kosong dianggap tidak diisi. */
const optionalText = (max: number, pattern?: RegExp) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), (pattern ? z.string().trim().max(max).regex(pattern) : z.string().trim().max(max)).optional());
/** Email opsional: kosong dianggap tidak diisi. */
const optionalEmail = z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().trim().email().optional());
export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  signerName: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64).default('Asia/Jakarta'),
  communicationPreference: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'),
  // Identitas penjual dan instruksi pembayaran yang dicetak di setiap nota.
  address: optionalText(300),
  phone: optionalText(30),
  email: optionalEmail,
  npwp: optionalText(25, /^[0-9][0-9.\- ]{13,23}$/),
  bankName: optionalText(80),
  bankAccountNumber: optionalText(40, /^[0-9][0-9\- ]{3,39}$/),
  bankAccountName: optionalText(120),
  invoiceNotes: optionalText(500)
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export const serviceCategorySchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) });
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;
export const clientSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(120), phone: z.string().regex(/^628\d{8,13}$/), email: optionalEmail, address: optionalText(300), communicationPreference: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'), categoryIds: z.array(z.string().min(1)).default([]) });
export type Client = z.infer<typeof clientSchema>;
export const clientInputSchema = clientSchema.omit({ id: true }).extend({ phone: z.string().trim().transform(normalizeIndonesianPhone).pipe(z.string().regex(/^628\d{8,13}$/)) });
export type ClientInput = z.input<typeof clientInputSchema>;

export const invoiceItemSchema = z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().int().positive(), unitPrice: z.number().int().nonnegative() });
export const invoiceInputSchema = z.object({ clientId: z.string().min(1), items: z.array(invoiceItemSchema).min(1).max(100) });
export const invoiceStatusSchema = z.enum(['draft', 'issued', 'paid', 'cancelled']);
export const invoiceSchema = invoiceInputSchema.extend({ id: z.string().min(1), number: z.string().optional(), subtotal: z.number().int().nonnegative(), total: z.number().int().nonnegative(), status: invoiceStatusSchema, version: z.number().int().positive(), revisions: z.array(z.object({ version: z.number().int().positive(), snapshot: z.unknown(), createdAt: z.string() })) });
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export const paymentMethodSchema = z.enum(['cash', 'transfer', 'card', 'other']);
export const paymentStatusSchema = z.enum(['pending', 'verified', 'reversed']);
export const paymentKindSchema = z.enum(['dp', 'termin_1', 'termin_2', 'settlement']);
export const paymentInputSchema = z.object({ amount: z.number().int().positive().safe(), method: paymentMethodSchema, reference: z.string().trim().min(1).max(160), kind: paymentKindSchema.optional(), paymentDate: z.iso.date().optional() });
export const paymentSchema = paymentInputSchema.extend({ id: z.string().min(1), invoiceId: z.string().min(1), status: paymentStatusSchema, version: z.number().int().positive().default(1), createdAt: z.string(), verifiedAt: z.string().optional(), reversedAt: z.string().optional(), reversalReason: z.string().trim().min(1).max(240).optional() });
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;

// Delivery contracts
export const deliveryApprovalSchema = z.object({
  id: z.string().min(1),
  notaId: z.string().min(1),
  revision: z.string().min(1),
  recipient: z.string().min(1),
  pdfHash: z.string().min(1),
  caption: z.string().min(1),
  validUntil: z.string(),
  scheduleAt: z.string()
});
export type DeliveryApproval = z.infer<typeof deliveryApprovalSchema>;

export const deliveryKeySchema = z.object({
  id: z.string().min(1), // deterministic ID (hash)
  approvalId: z.string().min(1)
});
export type DeliveryKey = z.infer<typeof deliveryKeySchema>;

export const deliveryStatusSchema = z.enum([
  'draft',
  'approved',
  'scheduled',
  'queued',
  'sending',
  'submitted',
  'delivered',
  'read',
  'failed',
  'unknown',
  'cancelled',
  'review'
]);
export const deliverySchema = z.object({
  id: z.string().min(1),
  approvalId: z.string().min(1),
  status: deliveryStatusSchema,
  messageId: z.string().optional(),
  deliveredAt: z.string().optional(),
  readAt: z.string().optional(),
  leaseExpires: z.string().optional(),
  fencingToken: z.string().optional(),
  attemptCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Delivery = z.infer<typeof deliverySchema>;

export const deliveryReceiptStatusSchema = z.enum(['delivered', 'read']);
export type DeliveryReceiptStatus = z.infer<typeof deliveryReceiptStatusSchema>;

export const deliveryReceiptSchema = z.object({
  receiptId: z.string().optional(),
  messageId: z.string().min(1),
  recipient: z.string().optional(),
  status: deliveryReceiptStatusSchema,
  timestamp: z.string().optional()
});
export type DeliveryReceipt = z.infer<typeof deliveryReceiptSchema>;

export const deliveryReceiptResponseSchema = z.object({
  success: z.boolean(),
  deliveryId: z.string().optional(),
  messageId: z.string(),
  previousStatus: deliveryStatusSchema.optional(),
  currentStatus: deliveryStatusSchema,
  deduplicated: z.boolean().default(false),
  error: z.string().optional()
});
export type DeliveryReceiptResponse = z.infer<typeof deliveryReceiptResponseSchema>;

export const deliveryAttemptSchema = z.object({
  id: z.string().min(1),
  deliveryId: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  result: z.enum(['sent', 'failed', 'unknown']),
  messageId: z.string().optional(),
  error: z.string().optional(),
  source: z.enum(['bridge', 'manual']).optional(),
  notes: z.string().optional(),
  createdAt: z.string()
});
export type DeliveryAttempt = z.infer<typeof deliveryAttemptSchema>;

// Office status & business event contracts
export const officeStaffIdSchema = z.enum(['hermes', 'admin', 'communication']);
export type OfficeStaffId = z.infer<typeof officeStaffIdSchema>;
export const officeStaffActivitySchema = z.discriminatedUnion('active', [
  z.object({ active: z.literal(true), activity: z.string().min(1) }),
  z.object({ active: z.literal(false), activity: z.null() })
]);
export const officeStaffSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  staff: z.object({ hermes: officeStaffActivitySchema, admin: officeStaffActivitySchema, communication: officeStaffActivitySchema })
});
export type OfficeStaffSnapshot = z.infer<typeof officeStaffSnapshotSchema>;

export const workStateSchema = z.enum(['working', 'available', 'away', 'stale', 'offline']);
export type WorkState = z.infer<typeof workStateSchema>;

export const officeStatusSchema = z.object({
  workState: workStateSchema,
  heartbeatAt: z.number(),
  activity: z.string()
});
export type OfficeStatus = z.infer<typeof officeStatusSchema>;

export const officeStatusEventSchema = z.object({
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  status: officeStatusSchema
});
export type OfficeStatusEvent = z.infer<typeof officeStatusEventSchema>;

export const officeStatusSnapshotSchema = z.object({
  ownerId: z.string(),
  sequence: z.number(),
  receivedAt: z.number(),
  status: officeStatusSchema
});
export type OfficeStatusSnapshot = z.infer<typeof officeStatusSnapshotSchema>;

export const officeBusinessEventTypeSchema = z.enum(['pdf_generated', 'delivery_sent', 'delivery_failed', 'app_job_completed', 'delivery_receipt']);
export type OfficeBusinessEventType = z.infer<typeof officeBusinessEventTypeSchema>;

export const pdfGeneratedEventSchema = z.object({
  type: z.literal('pdf_generated'),
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  invoiceId: z.string(),
  invoiceNumber: z.string().optional(),
  status: officeStatusSchema
});
export type PdfGeneratedEvent = z.infer<typeof pdfGeneratedEventSchema>;

export const deliverySentEventSchema = z.object({
  type: z.literal('delivery_sent'),
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  deliveryId: z.string(),
  recipient: z.string(),
  status: officeStatusSchema
});
export type DeliverySentEvent = z.infer<typeof deliverySentEventSchema>;

export const deliveryFailedEventSchema = z.object({
  type: z.literal('delivery_failed'),
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  deliveryId: z.string(),
  recipient: z.string(),
  error: z.string(),
  status: officeStatusSchema
});
export type DeliveryFailedEvent = z.infer<typeof deliveryFailedEventSchema>;

export const deliveryReceiptEventSchema = z.object({
  type: z.literal('delivery_receipt'),
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  deliveryId: z.string(),
  messageId: z.string(),
  receiptStatus: deliveryReceiptStatusSchema,
  status: officeStatusSchema
});
export type DeliveryReceiptEvent = z.infer<typeof deliveryReceiptEventSchema>;

export const appJobCompletedEventSchema = z.object({
  type: z.literal('app_job_completed'),
  ownerId: z.string(),
  eventId: z.string(),
  sequence: z.number(),
  occurredAt: z.number(),
  scheduleId: z.string(),
  runIdentity: z.string(),
  status: z.enum(['success', 'failed']),
  summary: z.string(),
  statusSnapshot: officeStatusSchema
});
export type AppJobCompletedEvent = z.infer<typeof appJobCompletedEventSchema>;

export const officeBusinessEventSchema = z.discriminatedUnion('type', [
  pdfGeneratedEventSchema,
  deliverySentEventSchema,
  deliveryFailedEventSchema,
  deliveryReceiptEventSchema,
  appJobCompletedEventSchema
]);
export type OfficeBusinessEvent = z.infer<typeof officeBusinessEventSchema>;

export const hermesToolNameSchema = z.enum([
  'clients.search',
  'invoices.create_draft',
  'invoices.preview',
  'payments.list',
  'deliveries.prepare',
  'deliveries.status',
  'office.get_status'
]);
export type HermesToolName = z.infer<typeof hermesToolNameSchema>;

export const hermesErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNKNOWN_TOOL',
  'NOT_FOUND',
  'OWNER_SCOPE_DENIED',
  'APPROVAL_REQUIRED',
  'SESSION_EXPIRED',
  'INTERNAL_ERROR'
]);
export type HermesErrorCode = z.infer<typeof hermesErrorCodeSchema>;

export const hermesToolProgressSchema = z.object({
  tool: hermesToolNameSchema,
  status: z.enum(['started', 'completed', 'failed']),
  at: z.string()
});
export type HermesToolProgress = z.infer<typeof hermesToolProgressSchema>;

export const hermesUsageSchema = z.object({
  profile: z.literal('synectra-office'),
  adapter: z.enum(['local', 'deterministic', 'router']),
  budgetSeconds: z.number().int().positive(),
  actualCostUsd: z.number().nonnegative().nullable()
});
export type HermesUsage = z.infer<typeof hermesUsageSchema>;

export const hermesSessionSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  profile: z.literal('synectra-office'),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  messageCount: z.number().int().nonnegative()
});
export type HermesSession = z.infer<typeof hermesSessionSchema>;

export const hermesMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['owner', 'hermes', 'tool']),
  text: z.string().max(4000),
  tool: hermesToolNameSchema.optional(),
  progress: z.array(hermesToolProgressSchema).default([]),
  result: z.unknown().optional(),
  error: z.object({ code: hermesErrorCodeSchema, message: z.string().max(500) }).optional(),
  createdAt: z.string()
});
export type HermesMessage = z.infer<typeof hermesMessageSchema>;

export const hermesToolRequestSchema = z.object({
  tool: hermesToolNameSchema,
  input: z.unknown()
});
export type HermesToolRequest = z.infer<typeof hermesToolRequestSchema>;

export const hermesConversationStatusSchema = z.object({
  session: hermesSessionSchema,
  messages: z.array(hermesMessageSchema),
  usage: hermesUsageSchema
});
export type HermesConversationStatus = z.infer<typeof hermesConversationStatusSchema>;

export const hermesMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000)
});
export type HermesMessageRequest = z.infer<typeof hermesMessageRequestSchema>;

export const hermesMessageResponseSchema = z.object({
  session: hermesSessionSchema,
  message: hermesMessageSchema,
  usage: hermesUsageSchema
});
export type HermesMessageResponse = z.infer<typeof hermesMessageResponseSchema>;

export const kanbanStatusSchema = z.enum([
  'triage',
  'todo',
  'scheduled',
  'ready',
  'running',
  'blocked',
  'review',
  'done',
  'archived'
]);
export type KanbanStatus = z.infer<typeof kanbanStatusSchema>;

export const kanbanTaskSchema = z.object({
  id: z.string().min(1),
  board: z.string().default('synectra-office'),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  status: kanbanStatusSchema,
  priority: z.number().int().default(0),
  assignee: z.string().nullable().optional(),
  createdAt: z.number().int(),
  dependencies: z.array(z.string()).optional(),
  artifacts: z.array(z.string()).optional(),
  blockedReason: z.string().nullable().optional(),
  reviewSummary: z.string().nullable().optional(),
  startedAt: z.number().int().nullable().optional(),
  completedAt: z.number().int().nullable().optional(),
  result: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  total: z.number().nullable().optional()
});
export type KanbanTask = z.infer<typeof kanbanTaskSchema>;

export const taskLinkSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  taskId: z.string().min(1),
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().nullable().optional(),
  clientName: z.string().min(1),
  total: z.number().int().nonnegative(),
  linkedAt: z.string(),
  linkedBy: z.string()
});
export type TaskLink = z.infer<typeof taskLinkSchema>;

export const kanbanBoardSnapshotSchema = z.object({
  board: z.string().min(1),
  tasks: z.array(kanbanTaskSchema),
  links: z.array(taskLinkSchema),
  isOffline: z.boolean(),
  lastSyncAt: z.string()
});
export type KanbanBoardSnapshot = z.infer<typeof kanbanBoardSnapshotSchema>;

export const createKanbanTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(4000).optional(),
  priority: z.number().int().min(0).max(10).optional().default(0),
  assignee: z.string().trim().max(100).optional(),
  status: z.enum(['ready', 'triage', 'blocked']).optional(),
  invoiceId: z.string().optional()
});
export type CreateKanbanTaskRequest = z.infer<typeof createKanbanTaskRequestSchema>;

export const transitionKanbanTaskRequestSchema = z.object({
  action: z.enum(['claim', 'block', 'unblock', 'request_review', 'complete', 'schedule', 'specify', 'archive']),
  reason: z.string().max(500).optional(),
  summary: z.string().max(2000).optional(),
  assignee: z.string().max(100).optional()
});
export type TransitionKanbanTaskRequest = z.infer<typeof transitionKanbanTaskRequestSchema>;

export const linkTaskInvoiceRequestSchema = z.object({
  taskId: z.string().min(1),
  invoiceId: z.string().min(1)
});
export type LinkTaskInvoiceRequest = z.infer<typeof linkTaskInvoiceRequestSchema>;

// Calendar and Cron contracts
export const scheduleTypeSchema = z.enum(['hermes_cron', 'outbox_delivery', 'app_job']);
export type ScheduleType = z.infer<typeof scheduleTypeSchema>;

export const scheduleActorSchema = z.enum(['hermes', 'admin', 'communication', 'system']);
export type ScheduleActor = z.infer<typeof scheduleActorSchema>;

export const scheduleStatusSchema = z.enum([
  'active',
  'paused',
  'scheduled',
  'running',
  'completed',
  'failed',
  'review'
]);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const missedRunPolicySchema = z.enum(['review', 'skip', 'catch_up']);
export type MissedRunPolicy = z.infer<typeof missedRunPolicySchema>;

export const calendarScheduleSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  type: scheduleTypeSchema,
  actor: scheduleActorSchema,
  schedule: z.string().min(1),
  timezone: z.string().default('Asia/Jakarta'),
  prompt: z.string().optional(),
  script: z.string().optional(),
  nextRunAt: z.string(),
  lastRunAt: z.string().nullable().optional(),
  status: scheduleStatusSchema,
  pausedReason: z.string().nullable().optional(),
  budget: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().default(0),
  effects: z.string(),
  timeoutMs: z.number().int().positive().default(30000),
  maxConcurrency: z.number().int().positive().default(1),
  missedRunPolicy: missedRunPolicySchema,
  referenceId: z.string().optional(), // misal deliveryId / approvalId
  hermesJobId: z.string().optional(), // job id dari `hermes cron create`, dipakai untuk pause/resume/runs
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CalendarSchedule = z.infer<typeof calendarScheduleSchema>;

export const calendarRunRecordSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  scheduleId: z.string().min(1),
  scheduleName: z.string().min(1),
  type: scheduleTypeSchema,
  actor: scheduleActorSchema,
  runIdentity: z.string().min(1),
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  status: z.enum(['success', 'failed', 'running', 'missed', 'review']),
  durationMs: z.number().int().nonnegative().default(0),
  summary: z.string(),
  errorReason: z.string().nullable().optional(),
  isChanged: z.boolean().default(false),
  fencingToken: z.string().optional()
});
export type CalendarRunRecord = z.infer<typeof calendarRunRecordSchema>;

export const createCalendarScheduleRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['hermes_cron', 'app_job']),
  actor: scheduleActorSchema.default('hermes'),
  schedule: z.string().trim().min(1).max(100),
  timezone: z.string().default('Asia/Jakarta'),
  prompt: z.string().max(2000).optional(),
  script: z.string().max(500).optional(),
  budget: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional().default(0),
  effects: z.string().trim().min(1).max(500),
  timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000),
  maxConcurrency: z.number().int().min(1).max(5).optional().default(1),
  missedRunPolicy: missedRunPolicySchema.default('review')
});
export type CreateCalendarScheduleRequest = z.input<typeof createCalendarScheduleRequestSchema>;

export const pauseCalendarScheduleRequestSchema = z.object({
  reason: z.string().trim().max(300).optional()
});
export type PauseCalendarScheduleRequest = z.infer<typeof pauseCalendarScheduleRequestSchema>;

export const calendarOverviewSchema = z.object({
  timezone: z.string().default('Asia/Jakarta'),
  currentTimeWib: z.string(),
  currentTimeUtc: z.string(),
  schedules: z.array(calendarScheduleSchema),
  recentRuns: z.array(calendarRunRecordSchema),
  pendingReviewCount: z.number().int().nonnegative()
});
export type CalendarOverview = z.infer<typeof calendarOverviewSchema>;

// Health per service contracts
export const serviceStatusValueSchema = z.enum(['ok', 'degraded', 'offline', 'error']);
export type ServiceStatusValue = z.infer<typeof serviceStatusValueSchema>;

export const singleServiceHealthSchema = z.object({
  status: serviceStatusValueSchema,
  message: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type SingleServiceHealth = z.infer<typeof singleServiceHealthSchema>;

export const servicesHealthResponseSchema = z.object({
  overall: serviceStatusValueSchema,
  environment: z.literal('development').default('development'),
  timestamp: z.string(),
  services: z.object({
    firestore: singleServiceHealthSchema,
    hermes: singleServiceHealthSchema,
    modelRouter: singleServiceHealthSchema,
    pdfRenderer: singleServiceHealthSchema,
    whatsapp: singleServiceHealthSchema
  }),
  recoveryGuides: z.record(z.string(), z.string())
});
export type ServicesHealthResponse = z.infer<typeof servicesHealthResponseSchema>;


