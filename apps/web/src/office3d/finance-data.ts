import type { Client, Invoice, Payment } from '@synectra/contracts';

export type ReceiptStatus = { paymentId: string; status: 'queued' | 'processing' | 'submitted' | 'failed' | 'review'; error?: string };
export type FinanceData = { clients: Client[]; invoices: Invoice[]; payments: Payment[]; receipts: ReceiptStatus[] };

export async function loadFinanceData(request: typeof fetch = fetch): Promise<FinanceData> {
  const responses = await Promise.all(['/api/clients', '/api/invoices', '/api/payments', '/api/payment-receipts'].map(url => request(url)));
  const failed = responses.find(response => !response.ok);
  if (failed) throw new Error(failed.status === 401 ? 'Sesi server terputus. Sistem mencoba menyambungkan kembali.' : `Data gagal dimuat (HTTP ${failed.status}). Coba lagi.`);
  const [clients, invoices, payments, receipts] = await Promise.all(responses.map(response => response.json())) as [{ clients: Client[] }, { invoices: Invoice[] }, { payments: Payment[] }, { receipts: ReceiptStatus[] }];
  return { clients: clients.clients, invoices: invoices.invoices, payments: payments.payments, receipts: receipts.receipts };
}
