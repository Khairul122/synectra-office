export const SCHEMA_VERSION = 1;

export const FIRESTORE_COLLECTIONS = {
  OWNERS: 'owners',
  CATEGORIES: 'categories',
  CLIENTS: 'clients',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  SEQUENCES: 'sequences',
  SIGNATURES: 'signatures',
  PDF_ASSETS: 'pdf_assets',
  OFFICE_STATUS: 'office_status',
  AUDIT: 'audit',
  IDEMPOTENCY: 'idempotency'
} as const;

export type DocumentWithSchema<T> = T & {
  schema_version: number;
  owner_id: string;
};

export function withSchema<T extends object>(data: T, ownerId: string): DocumentWithSchema<T> {
  return {
    ...data,
    schema_version: SCHEMA_VERSION,
    owner_id: ownerId
  };
}

export function migrateDocument<T extends { schema_version?: number }>(
  doc: T,
  migrator: (oldDoc: T) => T
): T {
  if (doc.schema_version === SCHEMA_VERSION) {
    return doc;
  }
  return migrator(doc);
}
