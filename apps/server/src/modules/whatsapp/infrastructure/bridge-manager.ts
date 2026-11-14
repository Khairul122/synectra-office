import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import type { WhatsappPairStatus, WhatsappConnectionStatus } from '@synectra/contracts';

export class BridgeManager {
  private bridgeScript: string;
  private sessionDir: string;
  private port: number;

  private currentStatus: WhatsappConnectionStatus = 'unpaired';
  private qrCode?: string;
  private user?: { id: string | null; name: string | null };
  private errorMessage?: string;

  private pairProcess?: ChildProcess;
  private serverProcess?: ChildProcess;

  constructor(opts?: { bridgeScript?: string; sessionDir?: string; port?: number; autoStart?: boolean }) {
    this.bridgeScript = opts?.bridgeScript || process.env.WHATSAPP_BRIDGE_SCRIPT || 'C:/Users/khair/AppData/Local/hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js';
    this.sessionDir = opts?.sessionDir || process.env.WHATSAPP_SESSION_DIR || path.resolve(process.cwd(), 'session/whatsapp');
    this.port = opts?.port || Number(process.env.WHATSAPP_BRIDGE_PORT || 3001);

    this.checkInitialState(opts?.autoStart !== false);
  }

  public validateAuthState(): { valid: boolean; error?: string } {
    if (!fs.existsSync(this.sessionDir)) {
      return { valid: false, error: 'pairing_required: session directory not found' };
    }

    const credsFile = path.join(this.sessionDir, 'creds.json');
    if (!fs.existsSync(credsFile)) {
      return { valid: false, error: 'pairing_required: credentials not found' };
    }

    try {
      const credsStat = fs.statSync(credsFile);
      if (credsStat.size === 0) {
        return { valid: false, error: 'pairing_required: creds.json is empty' };
      }
      const credsRaw = fs.readFileSync(credsFile, 'utf8');
      const credsJson = JSON.parse(credsRaw);
      if (!credsJson || typeof credsJson !== 'object') {
        return { valid: false, error: 'pairing_required: creds.json is not a valid JSON object' };
      }
    } catch {
      return { valid: false, error: 'pairing_required: creds.json corrupted' };
    }

    try {
      const files = fs.readdirSync(this.sessionDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'creds.json') continue;
        const filePath = path.join(this.sessionDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size === 0) {
          return { valid: false, error: `pairing_required: signal key file ${file} is empty` };
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        JSON.parse(raw);
      }
    } catch {
      return { valid: false, error: 'pairing_required: signal keys corrupted' };
    }

    return { valid: true };
  }

  public checkInitialState(startServer = true): WhatsappConnectionStatus {
    const integrity = this.validateAuthState();
    if (!integrity.valid) {
      this.currentStatus = 'unpaired';
      this.errorMessage = integrity.error;
      return this.currentStatus;
    }

    this.currentStatus = 'connecting';
    this.errorMessage = undefined;
    if (startServer) {
      this.startServerProcess();
    }
    return this.currentStatus;
  }

  public backupSession(backupDir: string): void {
    if (!fs.existsSync(this.sessionDir)) return;
    fs.mkdirSync(backupDir, { recursive: true });
    const files = fs.readdirSync(this.sessionDir);
    for (const file of files) {
      const src = path.join(this.sessionDir, file);
      const dest = path.join(backupDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
      }
    }
  }

  public restoreSession(backupDir: string): void {
    if (!fs.existsSync(backupDir)) return;
    fs.mkdirSync(this.sessionDir, { recursive: true });
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      const src = path.join(backupDir, file);
      const dest = path.join(this.sessionDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
      }
    }
  }

  public clearSession(): void {
    if (!fs.existsSync(this.sessionDir)) return;
    const files = fs.readdirSync(this.sessionDir);
    for (const file of files) {
      fs.unlinkSync(path.join(this.sessionDir, file));
    }
  }

  public getStatus(): WhatsappPairStatus {
    return {
      status: this.currentStatus,
      qrCode: this.qrCode,
      user: this.user,
      error: this.errorMessage
    };
  }

  public startPairing(): WhatsappPairStatus {
    if (this.currentStatus === 'connected') {
      return this.getStatus();
    }

    if (this.pairProcess) {
      return this.getStatus();
    }

    fs.mkdirSync(this.sessionDir, { recursive: true });

    this.currentStatus = 'connecting';
    this.errorMessage = undefined;
    this.qrCode = undefined;

    const bridgeCwd = path.dirname(this.bridgeScript);
    const proc = spawn('node', [this.bridgeScript, '--pair-only', '--pair-json', '--session', this.sessionDir], {
      cwd: bridgeCwd,
      stdio: ['ignore', 'pipe', 'inherit']
    });

    this.pairProcess = proc;

    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          this.handlePairEvent(ev);
        } catch {
          // non-JSON stdout ignored
        }
      }
    });

    proc.on('close', (code) => {
      this.pairProcess = undefined;
      const credsPath = path.join(this.sessionDir, 'creds.json');
      const hasCreds = fs.existsSync(credsPath);
      if (this.currentStatus === 'connected' || hasCreds) {
        this.currentStatus = 'connecting';
        this.startServerProcess();
      } else if (code !== 0 && this.currentStatus !== 'logged_out') {
        this.currentStatus = 'error';
        this.errorMessage = `Pairing process exited with code ${code}`;
      }
    });

    proc.on('error', (err) => {
      this.pairProcess = undefined;
      this.currentStatus = 'error';
      this.errorMessage = err.message;
    });

    return this.getStatus();
  }

  private handlePairEvent(ev: any) {
    if (ev.event === 'started') {
      this.currentStatus = 'connecting';
    } else if (ev.event === 'qr') {
      this.currentStatus = 'pairing';
      this.qrCode = this.generateQrSvg(ev.qr);
      this.printTerminalQr(ev.qr);
    } else if (ev.event === 'connected') {
      this.currentStatus = 'connected';
      this.qrCode = undefined;
      this.user = ev.user;
    } else if (ev.event === 'disconnected') {
      if (this.currentStatus !== 'connected') {
        this.currentStatus = 'reconnecting';
      }
    } else if (ev.event === 'error') {
      if (ev.error === 'logged_out') {
        this.currentStatus = 'logged_out';
      } else {
        this.currentStatus = 'error';
        this.errorMessage = ev.error || 'Bridge error';
      }
    }
  }

  private generateQrSvg(qrText: string): string {
    try {
      const bridgeReq = createRequire(this.bridgeScript);
      const QRCode = bridgeReq('qrcode-terminal/vendor/QRCode');
      const QRErrorCorrectLevel = bridgeReq('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
      const qr = new QRCode(-1, QRErrorCorrectLevel.L);
      qr.addData(qrText);
      qr.make();
      const count = qr.getModuleCount();
      let rects = '';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#000"/>`;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} ${count}" width="280" height="280" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
    } catch {
      return qrText;
    }
  }

  private printTerminalQr(qrText: string) {
    try {
      const bridgeReq = createRequire(this.bridgeScript);
      const qrcode = bridgeReq('qrcode-terminal');
      qrcode.generate(qrText, { small: true }, (ascii: string) => {
        console.log('\\n=== WHATSAPP PAIRING QR CODE ===\\n' + ascii + '\\n================================\\n');
      });
    } catch {
      console.log('QR Code:', qrText);
    }
  }

  public startServerProcess() {
    if (this.serverProcess) return;

    const bridgeCwd = path.dirname(this.bridgeScript);
    const proc = spawn('node', [this.bridgeScript, '--port', String(this.port), '--session', this.sessionDir], {
      cwd: bridgeCwd,
      stdio: ['ignore', 'pipe', 'inherit']
    });

    this.serverProcess = proc;

    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      if (chunk.includes('WhatsApp connected!')) {
        this.currentStatus = 'connected';
      }
    });

    proc.on('close', () => {
      this.serverProcess = undefined;
      if (this.currentStatus === 'connected') {
        this.currentStatus = 'reconnecting';
      }
    });

    proc.on('error', (err) => {
      this.serverProcess = undefined;
      this.currentStatus = 'error';
      this.errorMessage = err.message;
    });

    // Probe health periodically until connected
    this.pollBridgeHealth();
  }

  private async pollBridgeHealth(attempts = 30) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`);
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.status === 'connected') {
            this.currentStatus = 'connected';
            return;
          }
        }
      } catch {
        // server not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  public async sendMedia(chatId: string, filePath: string, fileName?: string, caption?: string) {
    if (this.currentStatus !== 'connected') {
      throw new Error('WhatsApp bridge not connected');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`http://127.0.0.1:${this.port}/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        filePath,
        mediaType: 'document',
        fileName,
        caption
      }),
      signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = (await res.json()) as any;
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Send media failed with status ${res.status}`);
    }

    return data as { success: boolean; messageId: string };
  }

  /** Ambil (dan kosongkan) antrean pesan masuk bridge. */
  public async pollMessages(): Promise<Array<{ chatId?: string; senderId?: string; body?: string }>> {
    if (this.currentStatus !== 'connected') return [];
    const res = await fetch(`http://127.0.0.1:${this.port}/messages`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Array<{ chatId?: string; senderId?: string; body?: string }>) : [];
  }

  public async sendText(chatId: string, message: string) {
    if (this.currentStatus !== 'connected') throw new Error('WhatsApp bridge not connected');
    const res = await fetch(`http://127.0.0.1:${this.port}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
      // Pesan pertama ke kontak baru bisa lambat (sinkron perangkat penerima); bridge sendiri menunggu hingga 60 detik.
      signal: AbortSignal.timeout(65000)
    });
    const data = (await res.json()) as any;
    if (!res.ok || !data.success) throw new Error(data.error || `Send failed with status ${res.status}`);
    return data as { success: boolean; messageId: string };
  }

  public disconnect(): WhatsappPairStatus {
    this.stop();
    this.currentStatus = 'unpaired';
    this.qrCode = undefined;
    this.user = undefined;
    this.errorMessage = undefined;
    return this.getStatus();
  }

  public stop() {
    if (this.pairProcess) {
      this.pairProcess.kill();
      this.pairProcess = undefined;
    }
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }
  }
}
