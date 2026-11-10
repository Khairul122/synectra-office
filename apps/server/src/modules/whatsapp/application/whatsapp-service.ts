import fs from 'fs';
import path from 'path';
import type { BridgeManager } from '../infrastructure/bridge-manager';
import type { WhatsappPairStatus, WhatsappSendPdfResponse } from '@synectra/contracts';

const PDF_FILE_NAME = 'nota-sintetis-synectra.pdf';
const PDF_MIME_TYPE = 'application/pdf';

export class WhatsappService {
  constructor(private readonly bridgeManager: BridgeManager) {}

  public getPairStatus(): WhatsappPairStatus {
    return this.bridgeManager.getStatus();
  }

  public startPairing(): WhatsappPairStatus {
    return this.bridgeManager.startPairing();
  }

  public disconnect(): WhatsappPairStatus {
    return this.bridgeManager.disconnect();
  }

  public async sendPdf(
    rawPhone: string,
    pdfBuffer: Buffer,
    fileName = 'nota-synectra.pdf',
    caption = 'Nota Synectra Office'
  ): Promise<WhatsappSendPdfResponse> {
    const digits = rawPhone.replace(/\D/g, '');
    if (!/^0\d{9,14}$/.test(digits) && !/^62\d{9,14}$/.test(digits)) {
      return { success: false, deliveryStatus: 'failed', error: 'Invalid phone' };
    }
    const countryPhone = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
    const chatId = `${countryPhone}@s.whatsapp.net`;

    const tmpDir = path.resolve('apps/server/.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tempFile = path.join(tmpDir, `nota-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(tempFile, pdfBuffer);

    try {
      const res = await this.bridgeManager.sendMedia(
        chatId,
        tempFile,
        fileName,
        caption
      );
      return {
        success: true,
        deliveryStatus: 'sent',
        messageId: res.messageId,
        fileName,
        mimeType: PDF_MIME_TYPE
      };
    } catch (err: any) {
      return {
        success: false,
        deliveryStatus: 'unknown',
        error: err instanceof Error ? err.message : 'WhatsApp send outcome unknown'
      };
    } finally {
      fs.unlink(tempFile, () => undefined);
    }
  }

  public async sendSyntheticPdf(rawPhone = '082165443677'): Promise<WhatsappSendPdfResponse> {
    const digits = rawPhone.replace(/\D/g, '');
    if (!/^0\d{9,14}$/.test(digits)) {
      return { success: false, deliveryStatus: 'failed', error: 'Invalid phone' };
    }
    const countryPhone = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
    const chatId = `${countryPhone}@s.whatsapp.net`;

    const tmpDir = path.resolve('apps/server/.tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const pdfPath = path.join(tmpDir, 'synthetic-nota.pdf');

    const pdfBuffer = this.generateSyntheticPdfBuffer();
    fs.writeFileSync(pdfPath, pdfBuffer);

    try {
      const res = await this.bridgeManager.sendMedia(
        chatId,
        pdfPath,
        PDF_FILE_NAME,
        'Nota Sintetis Synectra Office - Uji Integrasi Baileys Fase 0'
      );
      return {
        success: true,
        deliveryStatus: 'sent',
        messageId: res.messageId,
        fileName: PDF_FILE_NAME,
        mimeType: PDF_MIME_TYPE
      };
    } catch (err: any) {
      return {
        success: false,
        deliveryStatus: 'unknown',
        error: err instanceof Error ? err.message : 'WhatsApp send outcome unknown'
      };
    }
  }

  private generateSyntheticPdfBuffer(): Buffer {
    const streamContent = `BT\n/F1 18 Tf\n50 780 Td\n(SYNECTRA OFFICE - NOTA SINTETIS) Tj\n/F1 12 Tf\n0 -30 Td\n(Uji Coba Integrasi Baileys WhatsApp Fase 0) Tj\n0 -20 Td\n(Penerima: 082165443677) Tj\nET`;
    const streamLength = Buffer.byteLength(streamContent, 'utf-8');

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    const header = '%PDF-1.4\n';
    let body = '';
    const offsets: number[] = [];

    for (let i = 0; i < objects.length; i++) {
      const objId = i + 1;
      offsets.push(Buffer.byteLength(header + body, 'utf-8'));
      body += `${objId} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const startXref = Buffer.byteLength(header + body, 'utf-8');
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
    return Buffer.from(header + body + xref + trailer, 'utf-8');
  }
}
