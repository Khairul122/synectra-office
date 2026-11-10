import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Invoice, Payment } from '@synectra/contracts';
import { loadFinanceData, type FinanceData } from './finance-data';
type PaymentKind = NonNullable<Payment['kind']>;
const kinds: Record<PaymentKind, string> = { dp: 'DP', termin_1: 'Termin 1', termin_2: 'Termin 2', settlement: 'Pelunasan' };
const methods: Record<Payment['method'], string> = { transfer: 'Transfer', cash: 'Tunai', card: 'Kartu', other: 'Lainnya' };
const money = (amount: number) => `Rp${amount.toLocaleString('id-ID')}`;
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());

export function FinancePanel({ mode, csrfToken, onChanged }: { mode: 'dashboard' | 'payments'; csrfToken: string | null; onChanged: () => void }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState('');
  const [project, setProject] = useState('');
  const [total, setTotal] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [editing, setEditing] = useState<Payment | null>(null);
  const [kind, setKind] = useState<PaymentKind>('dp');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('transfer');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const invoiceKey = useRef<{ payload: string; key: string } | null>(null);
  const paymentKey = useRef<{ payload: string; key: string } | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    try {
      const result = await loadFinanceData();
      if (requestId.current === current) { setData(result); setError(''); }
    } catch (err) { if (requestId.current === current) setError(err instanceof Error ? err.message : 'Data gagal dimuat'); }
    finally { if (requestId.current === current) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { ++requestId.current; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, csrfToken]);

  const headers = { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) };
  const submit = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(response.status === 409 ? 'Data berubah. Muat ulang dan periksa sebelum menyimpan.' : result.error || 'Penyimpanan gagal');
    }
    return response.json();
  };
  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const payload = JSON.stringify({ clientId, items: [{ description: project, quantity: 1, unitPrice: Number(total) }] });
    if (invoiceKey.current?.payload !== payload) invoiceKey.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await submit('/api/invoices/automatic', { method: 'POST', headers: { ...headers, 'Idempotency-Key': invoiceKey.current.key }, body: payload }) as { invoice: Invoice };
      invoiceKey.current = null; setProject(''); setTotal(''); setInvoiceId(result.invoice.id);
      setNotice(`Tagihan ${result.invoice.number} dibuat. Tambahkan pembayaran di bawah.`);
      await refresh(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Tagihan gagal dibuat'); }
    finally { setBusy(false); }
  };
  const clearPayment = () => { setEditing(null); setAmount(''); setReference(''); setKind('dp'); setMethod('transfer'); setPaymentDate(today()); paymentKey.current = null; };
  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !invoiceId) return;
    setBusy(true); setError(''); setNotice('');
    const payload = JSON.stringify({ kind, amount: Number(amount), method, reference: reference.trim() || kinds[kind], paymentDate, ...(editing ? { version: editing.version } : { confirmed: true }) });
    if (!editing && paymentKey.current?.payload !== `${invoiceId}:${payload}`) paymentKey.current = { payload: `${invoiceId}:${payload}`, key: crypto.randomUUID() };
    try {
      await submit(editing ? `/api/payments/${editing.id}` : `/api/invoices/${invoiceId}/payments`, { method: editing ? 'PUT' : 'POST', headers: { ...headers, ...(!editing && paymentKey.current ? { 'Idempotency-Key': paymentKey.current.key } : {}) }, body: payload });
      clearPayment(); setNotice(editing ? 'Perubahan pembayaran tersimpan. Nota tidak dikirim ulang otomatis.' : 'Pembayaran tersimpan. Nota sedang disiapkan untuk WhatsApp klien.'); await refresh(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal disimpan'); }
    finally { setBusy(false); }
  };
  const removePayment = async (payment: Payment) => {
    if (busy || !window.confirm('Hapus pembayaran ini? Saldo akan dihitung ulang dan riwayat pembatalan tetap disimpan.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await submit(`/api/payments/${payment.id}`, { method: 'DELETE', headers, body: JSON.stringify({ version: payment.version }) });
      if (editing?.id === payment.id) clearPayment();
      setNotice('Pembayaran dibatalkan dan saldo diperbarui.'); await refresh(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal dihapus'); }
    finally { setBusy(false); }
  };
  const verifyPayment = async (payment: Payment) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await submit(`/api/payments/${payment.id}/verify`, { method: 'POST', headers });
      setNotice('Pembayaran diverifikasi dan saldo diperbarui.'); await refresh(); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal diverifikasi'); }
    finally { setBusy(false); }
  };
  const queueReceipt = async (paymentId: string, retry: boolean) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await submit(`/api/payment-receipts/${paymentId}${retry ? "/retry" : ""}`, { method: 'POST', headers }); setNotice('Nota dimasukkan kembali ke antrean.'); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Antrean gagal diperbarui'); }
    finally { setBusy(false); }
  };
  const editPayment = (payment: Payment) => {
    setEditing(payment); setInvoiceId(payment.invoiceId); setKind(payment.kind ?? 'dp'); setAmount(String(payment.amount)); setMethod(payment.method); setReference(payment.reference); setPaymentDate(payment.paymentDate ?? payment.createdAt.slice(0, 10)); setNotice(''); setError('');
  };
  if (!data) return <section className="finance-panel" aria-labelledby={`finance-${mode}`}>
    <h2 id={`finance-${mode}`}>{mode === 'dashboard' ? 'Dashboard keuangan' : 'Pembayaran'}</h2>
    {loading && <p role="status">Memuat data…</p>}
    {error && <><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => { setLoading(true); void refresh(); }}>Coba lagi</button></>}
  </section>;
  const issued = data.invoices.filter(invoice => invoice.status === 'issued' || invoice.status === 'paid');
  const rows = issued.map(invoice => {
    const paid = data.payments.filter(payment => payment.invoiceId === invoice.id && payment.status === 'verified').reduce((sum, payment) => sum + payment.amount, 0);
    return { invoice, client: data.clients.find(client => client.id === invoice.clientId), paid, remaining: Math.max(invoice.total - paid, 0) };
  });
  const selected = rows.find(row => row.invoice.id === invoiceId);
  const visiblePayments = data.payments.filter(payment => payment.status !== 'reversed');
  return <section className="finance-panel" aria-labelledby={`finance-${mode}`}>
    <h2 id={`finance-${mode}`}>{mode === 'dashboard' ? 'Dashboard keuangan' : 'Pembayaran'}</h2>
    {loading && <p role="status">Memuat data…</p>}
    {error && <p role="alert">{error} Data terakhir ditampilkan.</p>}
    {notice && <p role="status">{notice}</p>}
    {mode === 'dashboard' ? <>
      <div className="finance-stats"><div><span>Klien</span><strong>{data.clients.length}</strong></div><div><span>Total tagihan</span><strong>{money(rows.reduce((sum, row) => sum + row.invoice.total, 0))}</strong></div><div><span>Sudah dibayar</span><strong>{money(rows.reduce((sum, row) => sum + row.paid, 0))}</strong></div><div><span>Sisa tagihan</span><strong>{money(rows.reduce((sum, row) => sum + row.remaining, 0))}</strong></div></div>
      <h3>Ringkasan tagihan</h3>
      {rows.length ? <ul className="finance-list">{rows.map(({ invoice, client, paid, remaining }) => <li key={invoice.id}><strong>{client?.name ?? 'Klien tidak tersedia'} · {invoice.number}</strong><span>{invoice.items.map(item => item.description).join(', ')}</span><span>{money(invoice.total)} · Dibayar {money(paid)} · Sisa {money(remaining)}</span><span>{remaining === 0 ? 'Lunas' : 'Belum lunas'}</span></li>)}</ul> : <p>Belum ada tagihan terbit.</p>}
    </> : <>
      <h3>Buat tagihan</h3>
      <p>Isi klien, nama proyek, dan total tagihan. Nomor nota dibuat otomatis.</p>
      <form onSubmit={createInvoice} className="finance-form">
        <label>Klien<select required value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Pilih klien</option>{data.clients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}</select></label>
        {!data.clients.length && <p>Tambahkan klien melalui tab Klien dan arsip.</p>}
        <label>Nama proyek atau tagihan<input required maxLength={200} value={project} onChange={event => setProject(event.target.value)} /></label>
        <label>Total tagihan<input required type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} value={total} onChange={event => setTotal(event.target.value)} /></label>
        <button type="submit" disabled={busy || !data.clients.length}>Buat tagihan</button>
      </form>
      <h3>{editing ? 'Edit pembayaran' : 'Tambah pembayaran'}</h3>
      <form onSubmit={savePayment} className="finance-form">
        <label>Tagihan<select required disabled={!!editing || busy} value={invoiceId} onChange={event => { const id = event.target.value; setInvoiceId(id); if (kind === 'settlement' && !editing) setAmount(String(rows.find(row => row.invoice.id === id)?.remaining ?? '')); }}><option value="">Pilih tagihan</option>{editing && !rows.some(row => row.invoice.id === editing.invoiceId) && <option value={editing.invoiceId}>Nota belum terbit</option>}{rows.map(({ invoice, client, remaining }) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {client?.name ?? 'Klien'} · {invoice.items[0]?.description} · sisa {money(remaining)}</option>)}</select></label>
        {selected && <p>Total {money(selected.invoice.total)} · Dibayar {money(selected.paid)} · Sisa {money(selected.remaining)}</p>}
        <label>Jenis pembayaran<select value={kind} onChange={event => { const next = event.target.value as PaymentKind; setKind(next); if (next === 'settlement' && selected && !editing) setAmount(String(selected.remaining)); }}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Jumlah<input required type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>Tanggal pembayaran<input required type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></label>
        <label>Metode<select value={method} onChange={event => setMethod(event.target.value as Payment['method'])}>{Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Referensi (opsional)<input maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <p>Pembayaran yang disimpan dihitung sebagai sudah diterima.</p>
        <div className="finance-actions"><button type="submit" disabled={busy || !invoiceId}>{busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan pembayaran'}</button>{editing && <button type="button" className="secondary-button" onClick={clearPayment} disabled={busy}>Batal edit</button>}</div>
      </form>
      <h3>Riwayat pembayaran</h3>
      {visiblePayments.length ? <ul className="finance-list">{visiblePayments.map(payment => { const invoice = data.invoices.find(item => item.id === payment.invoiceId); const client = data.clients.find(item => item.id === invoice?.clientId); const receipt = data.receipts.find(item => item.paymentId === payment.id); return <li key={payment.id}><strong>{client?.name ?? 'Klien'} · {invoice?.number ?? 'Draft'}</strong><span>{payment.kind ? kinds[payment.kind] : methods[payment.method]} · {money(payment.amount)} · {payment.paymentDate ?? payment.createdAt.slice(0, 10)}</span><span>{payment.status === 'verified' ? 'Diterima' : 'Menunggu verifikasi'}</span>{receipt && <span>Nota WhatsApp: {receipt.status === 'submitted' ? 'diserahkan ke WhatsApp' : receipt.status === 'processing' ? 'sedang disiapkan' : receipt.status === 'queued' ? 'dalam antrean (WhatsApp harus terhubung)' : receipt.status === 'review' ? 'perlu diperiksa' : 'gagal disiapkan atau dikirim'}{receipt.error ? ` ? ${receipt.error}` : ''}</span>}<div className="finance-actions">{!receipt && payment.status === 'verified' && <button type="button" disabled={busy} onClick={() => queueReceipt(payment.id, false)}>Kirim nota</button>}{receipt?.status === 'failed' && <button type="button" disabled={busy} onClick={() => queueReceipt(payment.id, true)}>Coba kirim lagi</button>}{payment.status === 'pending' && <button type="button" disabled={busy} onClick={() => verifyPayment(payment)}>Verifikasi</button>}<button type="button" disabled={busy} onClick={() => editPayment(payment)}>Edit</button><button type="button" disabled={busy} onClick={() => removePayment(payment)}>Hapus</button></div></li>; })}</ul> : <p>Belum ada pembayaran.</p>}
    </>}
  </section>;
}
