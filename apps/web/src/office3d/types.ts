export type WorkState = 'working' | 'available' | 'away' | 'stale' | 'offline';

export interface OfficeStatus {
  workState: WorkState;
  heartbeatAt: number;
  activity: string;
}

export interface OfficeStatusEvent {
  ownerId: string;
  eventId: string;
  sequence: number;
  occurredAt: number;
  status: OfficeStatus;
}

export interface OfficeStatusSnapshot {
  ownerId: string;
  sequence: number;
  receivedAt: number;
  status: OfficeStatus;
}

export interface PerformanceMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  resolution: string;
  dpr: number;
  gpuRenderer: string;
  loadTimeMs: number;
}

// Business event types – mirror contract definitions
export type OfficeBusinessEventType = 'pdf_generated' | 'delivery_sent' | 'delivery_failed' | 'delivery_receipt' | 'app_job_completed';

export interface PdfGeneratedEvent {
  type: 'pdf_generated';
  ownerId: string;
  eventId: string;
  sequence: number;
  occurredAt: number;
  invoiceId: string;
  invoiceNumber?: string;
  status: OfficeStatus;
}

export interface DeliverySentEvent {
  type: 'delivery_sent';
  ownerId: string;
  eventId: string;
  sequence: number;
  occurredAt: number;
  deliveryId: string;
  recipient: string;
  status: OfficeStatus;
}

export interface DeliveryReceiptEvent {
  type: 'delivery_receipt';
  ownerId: string;
  eventId: string;
  sequence: number;
  occurredAt: number;
  deliveryId: string;
  messageId: string;
  receiptStatus: 'delivered' | 'read';
  status: OfficeStatus;
}

export interface DeliveryFailedEvent {
  type: 'delivery_failed';
  ownerId: string;
  eventId: string;
  sequence: number;
  occurredAt: number;
  deliveryId: string;
  recipient: string;
  error: string;
  status: OfficeStatus;
}

export type OfficeBusinessEvent = PdfGeneratedEvent | DeliverySentEvent | DeliveryFailedEvent | DeliveryReceiptEvent;

// Avatar customization and visual preferences for Task T23
export type HairStyle = 'short' | 'long' | 'wavy' | 'ponytail' | 'bald';
export type OutfitStyle = 'formal' | 'casual' | 'tech' | 'smart-casual';
export type Accessory = 'none' | 'glasses' | 'badge' | 'headphones' | 'coffee-cup';

export interface AvatarCustomization {
  hairStyle: HairStyle;
  hairColor: string;
  outfitStyle: OutfitStyle;
  outfitColor: string;
  accessory: Accessory;
  accentColor: string; // Defaults to #388DA7
}

export type AtmosphereCycle = 'day' | 'sunset' | 'night';

export interface AudioPreference {
  enabled: boolean;
  volume: number; // 0.0 - 1.0
}

export type ExpansionRoomId = 'terrace' | 'studio' | 'gaming';

