import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const whatsappConnectionStatusSchema = z.enum([
  'unpaired',
  'pairing',
  'connecting',
  'connected',
  'reconnecting',
  'logged_out',
  'error'
]);
export type WhatsappConnectionStatus = z.infer<typeof whatsappConnectionStatusSchema>;

export const whatsappPairStatusSchema = z.object({
  status: whatsappConnectionStatusSchema,
  qrCode: z.string().optional(),
  user: z.object({
    id: z.string().nullable(),
    name: z.string().nullable()
  }).optional(),
  error: z.string().optional()
});
export type WhatsappPairStatus = z.infer<typeof whatsappPairStatusSchema>;

export const whatsappSendPdfResponseSchema = z.object({
  success: z.boolean(),
  deliveryStatus: z.enum(['sent', 'unknown', 'failed']),
  messageId: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  error: z.string().optional()
});
export type WhatsappSendPdfResponse = z.infer<typeof whatsappSendPdfResponseSchema>;

