import { useEffect, useState } from 'react';

const ownerKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WHATSAPP_OWNER_KEY;
const ownerHeaders: Record<string, string> = ownerKey ? { 'x-whatsapp-owner-key': ownerKey } : {};
import { createRoot } from 'react-dom/client';
import {
  healthResponseSchema,
  whatsappPairStatusSchema,
  whatsappSendPdfResponseSchema,
  type WhatsappPairStatus
} from '@synectra/contracts';

function App() {
  const [serverHealth, setServerHealth] = useState('Memeriksa...');
  const [pairStatus, setPairStatus] = useState<WhatsappPairStatus>({ status: 'unpaired' });
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Health check
  useEffect(() => {
    const controller = new AbortController();
    fetch('/health', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Health check failed');
        return res.json();
      })
      .then((data) => {
        const parsed = healthResponseSchema.parse(data);
        setServerHealth(parsed.status === 'ok' ? 'Aktif' : 'Gangguan');
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerHealth('Tidak tersedia');
      });
    return () => controller.abort();
  }, []);

  // WhatsApp status polling
  const fetchPairStatus = async () => {
    try {
      const res = await fetch('/whatsapp/pair-status', {
        headers: Object.keys(ownerHeaders).length > 0 ? ownerHeaders : undefined
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = whatsappPairStatusSchema.parse(data);
        setPairStatus(parsed);
      }
    } catch {
      // ignore transient poll error
    }
  };

  useEffect(() => {
    fetchPairStatus();
    const interval = setInterval(fetchPairStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleStartPairing = async () => {
    try {
      const res = await fetch('/whatsapp/pair', {
        method: 'POST',
        headers: Object.keys(ownerHeaders).length > 0 ? ownerHeaders : undefined
      });
      if (res.ok) {
        const data = await res.json();
        setPairStatus(whatsappPairStatusSchema.parse(data));
      }
    } catch (err: any) {
      setPairStatus((prev) => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const handleSendSyntheticPdf = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/whatsapp/send-synthetic-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...ownerHeaders
        },
        body: JSON.stringify({ phone: '082165443677' })
      });
      const data = await res.json();
      const parsed = whatsappSendPdfResponseSchema.parse(data);
      if (parsed.success) {
        setSendResult(`Berhasil terkirim! Message ID: ${parsed.messageId}`);
      } else {
        setSendResult(`Gagal mengirim: ${parsed.error}`);
      }
    } catch (err: any) {
      setSendResult(`Error request: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#101326',
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem', letterSpacing: '0.05em', color: '#F2D29A' }}>
          SYNECTRA OFFICE
        </h1>
        <p style={{ margin: 0, color: '#A0AEC0', fontSize: '0.95rem' }}>
          Fase 0 — Integrasi Baileys WhatsApp & Nota Sintetis
        </p>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#718096' }}>
          Server API: <strong style={{ color: serverHealth === 'Aktif' ? '#48BB78' : '#F56565' }}>{serverHealth}</strong>
        </p>
      </header>

      <section
        style={{
          backgroundColor: '#1A1D36',
          borderRadius: '12px',
          border: '1px solid #2D3748',
          padding: '2rem',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <div style={{ width: '100%', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>Status WhatsApp:</span>
          <span
            role="status"
            style={{
              fontWeight: 600,
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              backgroundColor:
                pairStatus.status === 'connected'
                  ? 'rgba(72, 187, 120, 0.2)'
                  : pairStatus.status === 'error'
                  ? 'rgba(245, 101, 101, 0.2)'
                  : 'rgba(56, 141, 167, 0.2)',
              color:
                pairStatus.status === 'connected'
                  ? '#48BB78'
                  : pairStatus.status === 'error'
                  ? '#F56565'
                  : '#388DA7'
            }}
          >
            {pairStatus.status.toUpperCase()}
          </span>
        </div>

        {pairStatus.error && (
          <div
            style={{
              width: '100%',
              backgroundColor: 'rgba(245, 101, 101, 0.1)',
              border: '1px solid #F56565',
              borderRadius: '8px',
              padding: '0.75rem',
              color: '#FED7D7',
              fontSize: '0.85rem',
              marginBottom: '1.5rem'
            }}
          >
            {pairStatus.error}
          </div>
        )}

        {pairStatus.status === 'unpaired' && (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <p style={{ color: '#CBD5E0', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              WhatsApp belum terhubung ke sesi profil <code>synectra-office</code>.
            </p>
            <button
              onClick={handleStartPairing}
              style={{
                backgroundColor: '#388DA7',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              Mulai Pairing Web QR
            </button>
          </div>
        )}

        {pairStatus.status === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: '#CBD5E0', margin: 0 }}>Menghubungkan ke WhatsApp bridge...</p>
          </div>
        )}

        {pairStatus.status === 'pairing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ margin: '0 0 1rem 0', color: '#CBD5E0', fontSize: '0.9rem', textAlign: 'center' }}>
              Pindai QR ini melalui aplikasi WhatsApp di ponsel:
              <br />
              <span style={{ color: '#F2D29A', fontSize: '0.8rem' }}>Setelan → Perangkat Tertaut → Tautkan Perangkat</span>
            </p>
            {pairStatus.qrCode && pairStatus.qrCode.startsWith('<svg') ? (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  padding: '12px',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
                dangerouslySetInnerHTML={{ __html: pairStatus.qrCode }}
              />
            ) : (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#0F172A',
                  color: '#38BDF8',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                  borderRadius: '8px'
                }}
              >
                {pairStatus.qrCode || 'Memuat QR...'}
              </div>
            )}
          </div>
        )}

        {pairStatus.status === 'connected' && (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <div
              style={{
                backgroundColor: 'rgba(72, 187, 120, 0.1)',
                border: '1px solid #48BB78',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                color: '#C6F6D5',
                fontSize: '0.9rem'
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>WhatsApp Terhubung!</p>
              {pairStatus.user && (
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#A0AEC0' }}>
                  {pairStatus.user.name ? `${pairStatus.user.name} (${pairStatus.user.id})` : pairStatus.user.id}
                </p>
              )}
            </div>

            <div style={{ borderTop: '1px solid #2D3748', paddingTop: '1.5rem' }}>
              <p style={{ color: '#CBD5E0', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Verifikasi pengiriman dokumen PDF sintetis:
              </p>
              <button
                disabled={isSending}
                onClick={handleSendSyntheticPdf}
                style={{
                  backgroundColor: isSending ? '#4A5568' : '#F2D29A',
                  color: '#101326',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: isSending ? 'not-allowed' : 'pointer'
                }}
              >
                {isSending ? 'Mengirim...' : 'Kirim PDF ke 082165443677'}
              </button>

              {sendResult && (
                <p
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.85rem',
                    color: sendResult.includes('Berhasil') ? '#48BB78' : '#F56565'
                  }}
                >
                  {sendResult}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
