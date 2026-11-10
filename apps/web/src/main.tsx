import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, authConfigurationError, signInWithGoogle, signOut } from './firebase';
import { OfficeSpikeView } from './office3d/OfficeSpikeView';
import { HermesChatPanel } from './office3d/HermesChatPanel';
import { KanbanBoardPanel } from './office3d/KanbanBoardPanel';
import { CalendarSchedulePanel } from './office3d/CalendarSchedulePanel';
import { SignaturePanel } from './office3d/SignaturePanel';
import { BusinessProfilePanel } from './office3d/BusinessProfilePanel';
import { FinancePanel } from './office3d/FinancePanel';
import {
  healthResponseSchema,
  whatsappPairStatusSchema,
  type Delivery,
  type DeliveryApproval,
  type DeliveryAttempt,
  type WhatsappPairStatus,
  type Client,
  type Payment
} from '@synectra/contracts';

type DeliveryItem = {
  delivery: Delivery;
  approval: DeliveryApproval | null;
  attempts: DeliveryAttempt[];
};

function formatWaLink(phone: string, caption?: string) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  const text = caption ? encodeURIComponent(caption) : '';
  return `https://wa.me/${cleaned}${text ? `?text=${text}` : ''}`;
}

const ownerKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WHATSAPP_OWNER_KEY;
const ownerHeaders: Record<string, string> = ownerKey ? { 'x-whatsapp-owner-key': ownerKey } : {};

function App() {
  const [serverHealth, setServerHealth] = useState('Memeriksa...');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(authConfigurationError);
  const [authPending, setAuthPending] = useState(Boolean(auth));
  const [savedUser, setSavedUser] = useState<User | null>(null);
  const [pairStatus, setPairStatus] = useState<WhatsappPairStatus | null>(null);
  const [pairStatusError, setPairStatusError] = useState<string | null>(null);
  const pairStatusRequest = useRef(0);
  const pairPollInFlight = useRef<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientLoadError, setClientLoadError] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientBusy, setClientBusy] = useState(false);
  const clientRequest = useRef(false);
  const clientMutationVersion = useRef(0);
  const [invoices, setInvoices] = useState<Array<{ id: string; clientId: string; total: number; status: string; number?: string; version: number }>>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [allPayments, setAllPayments] = useState<Payment[] | null>(null);
  const [invoiceClientId, setInvoiceClientId] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('');
  const [invoicePrice, setInvoicePrice] = useState('');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState('');
  const signatureFileRef = useRef<HTMLInputElement>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ id: string; label: string; owner: string | null } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [enqueueCaption, setEnqueueCaption] = useState('');
  const [enqueueScheduleAt, setEnqueueScheduleAt] = useState('');
  const [isProcessingDelivery, setIsProcessingDelivery] = useState<string | null>(null);
  const [manualAttemptDeliveryId, setManualAttemptDeliveryId] = useState<string | null>(null);
  const [manualAttemptResult, setManualAttemptResult] = useState<'sent' | 'failed' | 'unknown'>('sent');
  const [manualAttemptNotes, setManualAttemptNotes] = useState('');
  const [businessActivity, setBusinessActivity] = useState<string | null>(null);

  const sessionRequest = useRef<Promise<void> | null>(null);
  const loggingOut = useRef(false);
  const restoreSession = useCallback((user: User) => {
    if (sessionRequest.current) return sessionRequest.current;
    const request = (async () => {
      const idToken = await user.getIdToken();
      const response = await fetch('/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
      });
      if (!response.ok) throw new Error('Sesi server gagal dipulihkan. Periksa koneksi atau masuk kembali.');
      const data = await response.json() as { email?: string; csrfToken: string };
      if (loggingOut.current || auth?.currentUser?.uid !== user.uid) return;
      setUserEmail(data.email ?? user.email ?? 'Google user');
      setCsrfToken(data.csrfToken);
      setAuthError(null);
    })();
    sessionRequest.current = request;
    void request.finally(() => { if (sessionRequest.current === request) sessionRequest.current = null; }).catch(() => undefined);
    return request;
  }, []);

  useEffect(() => {
    if (!auth) return;
    let version = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const current = ++version;
      setSavedUser(user);
      if (!user) {
        setUserEmail(null); setCsrfToken(null); setPdfPreview(null);
        setClients([]); setInvoices([]); setAllPayments(null); setInvoiceClientId('');
        setEditingClientId(null); setClientName(''); setClientPhone(''); setClientEmail(''); setClientAddress(''); setClientError(null); setClientNotice(null);
        setAuthPending(false);
        return;
      }
      if (loggingOut.current) return;
      setAuthPending(true);
      void restoreSession(user).catch(error => {
        if (version === current) setAuthError(error instanceof Error ? error.message : 'Sesi gagal dipulihkan.');
      }).finally(() => { if (version === current) setAuthPending(false); });
    }, () => {
      version++;
      setAuthError('Sesi login gagal dimuat. Coba masuk kembali.');
      setAuthPending(false);
    });
    return () => { version++; unsubscribe(); };
  }, [restoreSession]);

  const retrySession = async () => {
    if (!savedUser || auth?.currentUser?.uid !== savedUser.uid) return;
    setAuthPending(true); setAuthError(null);
    try { await restoreSession(savedUser); }
    catch (error) { if (auth?.currentUser?.uid === savedUser.uid) setAuthError(error instanceof Error ? error.message : 'Sesi gagal dipulihkan.'); }
    finally { if (auth?.currentUser?.uid === savedUser.uid) setAuthPending(false); }
  };

  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    const checkSession = async () => {
      if (document.visibilityState !== 'visible' || loggingOut.current) return;
      try {
        const response = await fetch('/auth/me');
        const user = auth?.currentUser;
        if (!user || cancelled || loggingOut.current) return;
        if (response.status === 401) await restoreSession(user);
        else if (response.ok) {
          const session = await response.json() as { userId: string; csrfToken: string };
          if (cancelled || loggingOut.current || auth?.currentUser?.uid !== user.uid) return;
          if (session.userId !== user.uid) await restoreSession(user);
          else setCsrfToken(session.csrfToken);
        }
      } catch { /* Retry when connectivity returns. */ }
    };
    void checkSession();
    const timer = window.setInterval(checkSession, 15000);
    window.addEventListener('focus', checkSession);
    document.addEventListener('visibilitychange', checkSession);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', checkSession); document.removeEventListener('visibilitychange', checkSession); };
  }, [userEmail, restoreSession]);

  // Refresh health after outages and when the page becomes visible again.
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    const checkHealth = () => {
      const current = ++sequence;
      fetch('/health', { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('Health check failed');
          return res.json();
        })
        .then((data) => {
          const parsed = healthResponseSchema.parse(data);
          if (current === sequence) setServerHealth(parsed.status === 'ok' ? 'Aktif' : 'Gangguan');
        })
        .catch(() => {
          if (!controller.signal.aborted && current === sequence) setServerHealth('Tidak tersedia');
        });
    };
    const onVisible = () => { if (!document.hidden) checkHealth(); };
    checkHealth();
    const timer = window.setInterval(checkHealth, 30000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      loggingOut.current = false;
      await signInWithGoogle();
      if (auth?.currentUser) await restoreSession(auth.currentUser);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login gagal');
    }
  };

  const handleLogout = async () => {
    loggingOut.current = true;
    try {
      if (sessionRequest.current) await sessionRequest.current.catch(() => undefined);
      const current = await fetch('/auth/me');
      const session = current.ok ? await current.json() as { csrfToken: string } : null;
      await fetch('/auth/logout', { method: 'POST', headers: session ? { 'x-csrf-token': session.csrfToken } : undefined });
      if (auth) await signOut(auth);
      setUserEmail(null);
      setCsrfToken(null);
    } finally { loggingOut.current = false; }
  };

  const fetchDeliveries = async () => {
    if (!userEmail) return;
    try {
      const res = await fetch('/api/deliveries');
      if (res.ok) {
        const data = (await res.json()) as { deliveries: DeliveryItem[] };
        setDeliveries(data.deliveries);
      }
    } catch (err: unknown) {
      setDeliveryError(err instanceof Error ? err.message : 'Gagal memuat delivery outbox');
    }
  };

  const fetchInvoices = (silent = false, signal?: AbortSignal) => {
    if (!userEmail) return;
    if (!silent) setInvoicesLoading(true);
    fetch('/api/invoices', { signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Gagal memuat nota')))
      .then((data: { invoices: typeof invoices }) => { setInvoices(data.invoices); setInvoiceError(null); })
      .catch((error: Error) => { if (!signal?.aborted) setInvoiceError(error.message); })
      .finally(() => { if (!silent && !signal?.aborted) setInvoicesLoading(false); });
  };

  const fetchAllPayments = (signal?: AbortSignal) => {
    if (!userEmail) return;
    fetch('/api/payments', { signal }).then(response => response.ok ? response.json() : Promise.reject(new Error('Gagal memuat pembayaran')))
      .then((data: { payments: Payment[] }) => setAllPayments(data.payments))
      .catch(() => { if (!signal?.aborted) setAllPayments(null); });
  };

  useEffect(() => {
    if (!userEmail) return;
    const controller = new AbortController();
    fetchInvoices(false, controller.signal);
    const refreshClients = () => {
      const version = clientMutationVersion.current;
      return fetch('/api/clients', { signal: controller.signal })
        .then(response => response.ok ? response.json() : Promise.reject(new Error('Gagal memuat klien')))
        .then((data: { clients: Client[] }) => { if (version === clientMutationVersion.current) { setClients(data.clients); setClientLoadError(null); } })
        .catch((error: Error) => { if (!controller.signal.aborted && version === clientMutationVersion.current) setClientLoadError(error.message); });
    };
    void refreshClients();
    fetchAllPayments(controller.signal);
    fetchDeliveries();
    const refresh = () => { if (document.visibilityState === 'visible') { fetchInvoices(true, controller.signal); fetchAllPayments(controller.signal); void refreshClients(); } };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); setClients([]); setInvoices([]); setAllPayments(null); setInvoiceClientId(''); };
  }, [userEmail, csrfToken]);

  const handleCreateInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setInvoiceError(null);
    const response = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) }, body: JSON.stringify({ clientId: invoiceClientId, items: [{ description: invoiceDescription, quantity: 1, unitPrice: Number(invoicePrice) }] }) });
    if (!response.ok) { setInvoiceError('Detail nota tidak valid'); return; }
    const data = await response.json() as { invoice: typeof invoices[number] }; setInvoices((current) => [...current, data.invoice]); setInvoiceDescription(''); setInvoicePrice('');
  };

  const handleIssueInvoice = async (invoice: typeof invoices[number]) => {
    setInvoiceError(null);
    const response = await fetch(`/api/invoices/${invoice.id}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${invoice.id}:${invoice.version}`, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
      body: JSON.stringify({ version: invoice.version })
    });
    if (!response.ok) { setInvoiceError('Nota gagal diterbitkan'); return; }
    const data = await response.json() as { invoice: typeof invoice };
    setInvoices((current) => current.map((item) => item.id === invoice.id ? data.invoice : item));
  };

  const handleGeneratePdf = async (invoice: typeof invoices[number]) => {
    setPdfError(null);
    setPdfPreview(null);
    setPdfLoading(true);
    setBusinessActivity(`Membuat PDF ${invoice.number ?? invoice.id}`);
    try {
      if (signatureData) {
        const signatureResponse = await fetch('/api/signatures', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) }, body: JSON.stringify({ data: signatureData }) });
        if (!signatureResponse.ok) throw new Error('Tanda tangan tidak valid');
        setSignatureData('');
      }
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`, { method: 'POST', headers: csrfToken ? { 'x-csrf-token': csrfToken } : {} });
      if (!response.ok) throw new Error('PDF gagal dibuat. Terbitkan nota dan simpan tanda tangan dulu.');
      const data = await response.json() as { pdf: { id: string } };
      setPdfPreview({ id: data.pdf.id, label: invoice.number ?? invoice.id, owner: userEmail });
      setBusinessActivity(`PDF siap ${invoice.number ?? invoice.id}`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'PDF gagal dibuat');
      setBusinessActivity('PDF gagal dibuat');
    } finally {
      setPdfLoading(false);
    }
  };

  const clearClientForm = () => {
    setEditingClientId(null); setClientName(''); setClientPhone(''); setClientEmail(''); setClientAddress('');
  };
  const editClient = (client: Client) => {
    setEditingClientId(client.id); setClientName(client.name); setClientPhone(client.phone);
    setClientEmail(client.email ?? ''); setClientAddress(client.address ?? ''); setClientError(null); setClientNotice(null);
    document.getElementById('client-name')?.focus();
  };
  const handleSaveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (clientRequest.current) return;
    const current = editingClientId ? clients.find(client => client.id === editingClientId) : undefined;
    if (editingClientId && !current) { setClientError('Data klien belum tersedia. Muat ulang dan coba lagi.'); return; }
    const ownerUid = auth?.currentUser?.uid;
    if (!ownerUid) { setClientError('Sesi login belum tersedia.'); return; }
    clientRequest.current = true; setClientBusy(true); setClientError(null); setClientNotice(null); ++clientMutationVersion.current;
    try {
      const response = await fetch(editingClientId ? `/api/clients/${editingClientId}` : '/api/clients', {
        method: editingClientId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify({ name: clientName, phone: clientPhone, email: clientEmail, address: clientAddress, ...(current ? { communicationPreference: current.communicationPreference, categoryIds: current.categoryIds } : {}) })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(response.status === 409 ? 'Nama klien sudah digunakan. Gunakan nama lain atau edit klien yang ada.' : response.status === 422 ? 'Periksa nama, nomor WhatsApp, email, dan alamat.' : result.error || 'Klien gagal disimpan.');
      }
      const result = await response.json() as { client: Client };
      if (auth?.currentUser?.uid !== ownerUid) return;
      setClients(previous => editingClientId ? previous.map(client => client.id === editingClientId ? result.client : client) : [...previous.filter(client => client.id !== result.client.id), result.client]);
      setClientNotice(editingClientId ? 'Data klien diperbarui.' : 'Klien ditambahkan.'); clearClientForm();
    } catch (error) { if (auth?.currentUser?.uid === ownerUid) setClientError(error instanceof Error ? error.message : 'Klien gagal disimpan.'); }
    finally { ++clientMutationVersion.current; clientRequest.current = false; setClientBusy(false); }
  };
  const handleDeleteClient = async (client: Client) => {
    if (clientRequest.current) return;
    if (invoices.some(invoice => invoice.clientId === client.id)) { setClientError('Klien memiliki nota terkait dan tidak dapat dihapus.'); return; }
    if (!window.confirm(`Hapus klien "${client.name}"?`)) return;
    const ownerUid = auth?.currentUser?.uid;
    if (!ownerUid) { setClientError('Sesi login belum tersedia.'); return; }
    clientRequest.current = true; setClientBusy(true); setClientError(null); setClientNotice(null); ++clientMutationVersion.current;
    try {
      const response = await fetch(`/api/clients/${client.id}`, { method: 'DELETE', headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined });
      if (!response.ok) throw new Error(response.status === 409 ? 'Klien memiliki nota terkait dan tidak dapat dihapus.' : response.status === 404 ? 'Klien tidak ditemukan. Muat ulang daftar.' : 'Klien gagal dihapus.');
      if (auth?.currentUser?.uid !== ownerUid) return;
      setClients(previous => previous.filter(item => item.id !== client.id));
      if (editingClientId === client.id) clearClientForm();
      setClientNotice('Klien dihapus.');
    } catch (error) { if (auth?.currentUser?.uid === ownerUid) setClientError(error instanceof Error ? error.message : 'Klien gagal dihapus.'); }
    finally { ++clientMutationVersion.current; clientRequest.current = false; setClientBusy(false); }
  };

  // WhatsApp status polling
  const fetchPairStatus = async (signal?: AbortSignal) => {
    if (!userEmail || pairPollInFlight.current !== null) return;
    const request = ++pairStatusRequest.current;
    pairPollInFlight.current = request;
    try {
      const timeout = AbortSignal.timeout(10000);
      const res = await fetch('/whatsapp/pair-status', { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) throw new Error(res.status === 401 ? 'Sesi kantor belum aktif. Tunggu atau masuk kembali.' : 'Status WhatsApp tidak dapat dimuat.');
      const parsed = whatsappPairStatusSchema.parse(await res.json());
      if (!signal?.aborted && request === pairStatusRequest.current) { setPairStatus(parsed); setPairStatusError(null); }
    } catch (err: unknown) {
      if (!signal?.aborted && request === pairStatusRequest.current) { setPairStatus(null); setPairStatusError(err instanceof Error ? err.message : 'Status WhatsApp tidak dapat dimuat.'); }
    } finally {
      if (pairPollInFlight.current === request) pairPollInFlight.current = null;
    }
  };

  useEffect(() => {
    if (!userEmail) return;
    const controller = new AbortController();
    setPairStatus(null); setPairStatusError(null);
    void fetchPairStatus(controller.signal);
    const interval = setInterval(() => void fetchPairStatus(controller.signal), 2500);
    return () => { controller.abort(); clearInterval(interval); pairPollInFlight.current = null; ++pairStatusRequest.current; };
  }, [userEmail, csrfToken]);

  const handleStartPairing = async () => {
    ++pairStatusRequest.current;
    try {
      const res = await fetch('/whatsapp/pair', {
        method: 'POST', headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined
      });
      if (!res.ok) throw new Error('Gagal menghubungkan WhatsApp. Periksa sesi kantor.');
      const status = whatsappPairStatusSchema.parse(await res.json());
      ++pairStatusRequest.current; setPairStatus(status); setPairStatusError(null);
    } catch (err: unknown) {
      ++pairStatusRequest.current; setPairStatus(null); setPairStatusError(err instanceof Error ? err.message : 'Gagal menghubungkan WhatsApp.');
    }
  };

  const handleDisconnectWhatsapp = async () => {
    ++pairStatusRequest.current;
    try {
      const res = await fetch('/whatsapp/disconnect', {
        method: 'POST', headers: { ...ownerHeaders, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) }
      });
      if (!res.ok) throw new Error('Gagal memutuskan WhatsApp. Periksa sesi kantor.');
      const status = whatsappPairStatusSchema.parse(await res.json());
      ++pairStatusRequest.current; setPairStatus(status); setPairStatusError(null);
    } catch (err: unknown) {
      ++pairStatusRequest.current; setPairStatus(null); setPairStatusError(err instanceof Error ? err.message : 'Gagal memutuskan WhatsApp.');
    }
  };

  const handleEnqueueDelivery = async (invoiceId: string) => {
    setDeliveryError(null);
    setIsProcessingDelivery(invoiceId);
    try {
      const inv = invoices.find((i) => i.id === invoiceId);
      if (!inv) throw new Error('Nota tidak ditemukan');
      const cl = clients.find((c) => c.id === inv.clientId);
      if (!cl) throw new Error('Klien tidak ditemukan untuk nota ini');

      if (signatureData) {
        const signatureResponse = await fetch('/api/signatures', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) }, body: JSON.stringify({ data: signatureData }) });
        if (!signatureResponse.ok) throw new Error('Tanda tangan tidak valid');
        setSignatureData('');
      }

      const pdfRes = await fetch(`/api/invoices/${invoiceId}/pdf`, {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined
      });
      if (!pdfRes.ok) {
        const errData = (await pdfRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Gagal menyiapkan PDF nota');
      }
      const { pdf } = (await pdfRes.json()) as { pdf: { sha256: string } };

      const caption = enqueueCaption.trim() || `Nota ${inv.number ?? inv.id} untuk ${cl.name}`;
      const schedule = enqueueScheduleAt ? new Date(enqueueScheduleAt).toISOString() : new Date().toISOString();
      const res = await fetch('/api/deliveries/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        },
        body: JSON.stringify({
          notaId: inv.id,
          revision: String(inv.version),
          recipient: cl.phone,
          pdfHash: pdf.sha256,
          caption,
          validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
          scheduleAt: schedule
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Gagal memasukkan nota ke antrean outbox');
      }
      setEnqueueCaption('');
      setEnqueueScheduleAt('');
      await fetchDeliveries();
    } catch (err: unknown) {
      setDeliveryError(err instanceof Error ? err.message : 'Gagal antrekan pengiriman');
    } finally {
      setIsProcessingDelivery(null);
    }
  };

  const handleSendBridge = async (deliveryId: string) => {
    setDeliveryError(null);
    setBusinessActivity(`Mengirim nota ${deliveryId}`);
    setIsProcessingDelivery(deliveryId);
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}/send`, {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Gagal mengirim melalui WhatsApp bridge');
      }
      const data = await res.json() as { delivery: Delivery };
      await fetchDeliveries();
      if (data.delivery.status !== 'submitted') throw new Error('Nota belum terkirim. Periksa status outbox.');
      setBusinessActivity(`Nota ${deliveryId} dikirim ke WhatsApp`);
    } catch (err: unknown) {
      setDeliveryError(err instanceof Error ? err.message : 'Error kirim bridge');
      setBusinessActivity('Pengiriman nota gagal');
    } finally {
      setIsProcessingDelivery(null);
    }
  };

  const handleRecordManualAttempt = async (deliveryId: string) => {
    setDeliveryError(null);
    setIsProcessingDelivery(deliveryId);
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}/manual-attempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        },
        body: JSON.stringify({
          result: manualAttemptResult,
          notes: manualAttemptNotes.trim() || undefined
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Gagal mencatat konfirmasi manual');
      }
      setManualAttemptDeliveryId(null);
      setManualAttemptNotes('');
      await fetchDeliveries();
    } catch (err: unknown) {
      setDeliveryError(err instanceof Error ? err.message : 'Error catat manual attempt');
    } finally {
      setIsProcessingDelivery(null);
    }
  };

  if (authPending) return <main className="login-page"><p role="status">Memulihkan sesi?</p></main>;

  if (!userEmail && savedUser) return <main className="login-page"><section className="login-card">
    <h1>Sesi belum dapat dipulihkan</h1>
    <p role="alert">{authError ?? 'Periksa koneksi server, lalu coba lagi.'}</p>
    <button type="button" onClick={() => void retrySession()}>Coba lagi</button>
  </section></main>;

  if (!userEmail) {
    return <main className="login-page">
      <section className="login-card">
        <span className="login-eyebrow">SYNECTRA OFFICE</span>
        <h1>Ruang kerja bersama.</h1>
        <p>Masuk untuk membuka kantor Anda.</p>
        <button disabled={!auth} onClick={handleGoogleLogin}>Masuk dengan Google</button>
        {authError && <p role="alert">{authError}</p>}
      </section>
    </main>;
  }

  const matchingClients = clients.filter(client => `${client.name} ${client.phone} ${client.email ?? ''}`.toLocaleLowerCase().includes(clientSearch.trim().toLocaleLowerCase()));

  return <OfficeSpikeView
    serverHealth={serverHealth}
    whatsappStatus={pairStatusError ? 'unavailable' : pairStatus?.status ?? 'checking'}
    businessActivity={businessActivity ?? undefined}
    userEmail={userEmail}
    onLogout={handleLogout}
    dashboardPanel={<FinancePanel mode="dashboard" csrfToken={csrfToken} onChanged={() => { fetchInvoices(); fetchAllPayments(); }} />}
    paymentPanel={<FinancePanel mode="payments" csrfToken={csrfToken} onChanged={() => { fetchInvoices(); fetchAllPayments(); }} />}
    signaturePanel={<SignaturePanel csrfToken={csrfToken} onSaved={() => { setSignatureData(''); if (signatureFileRef.current) signatureFileRef.current.value = ''; }} />}
    hermesPanel={
      <HermesChatPanel
        csrfToken={csrfToken}
        onActivity={(act) => setBusinessActivity(act)}
        onRefreshInvoices={fetchInvoices}
      />
    }
    boardPanel={<KanbanBoardPanel csrfToken={csrfToken} invoices={invoices.map(invoice => ({ id: invoice.id, number: invoice.number, clientName: clients.find(client => client.id === invoice.clientId)?.name, total: invoice.total }))} />}
    adminPanel={
      <section aria-labelledby="invoices-title">
        <h2 id="invoices-title">Nota</h2>
        <p>Nota dibuat dari tagihan dan pembayaran. Setelah pembayaran baru disimpan, PDF disiapkan dan dikirim otomatis ke WhatsApp klien.</p>
        <BusinessProfilePanel csrfToken={csrfToken} />
        <details><summary>Opsi nota manual</summary>
        <form onSubmit={handleCreateInvoice} style={{ display: 'grid', gap: '0.5rem' }}>
          <label>Klien<select required value={invoiceClientId} onChange={(event) => setInvoiceClientId(event.target.value)}><option value="">Pilih klien</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          {clients.length === 0 && <p>Belum ada klien. Tambahkan klien melalui Klien &amp; arsip terlebih dahulu.</p>}
          <label>Deskripsi<input required value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} /></label>
          <label>Total rupiah<input required type="number" min="0" step="1" value={invoicePrice} onChange={(event) => setInvoicePrice(event.target.value)} /></label>
          <button type="submit">Simpan draft nota</button>
        </form>
        {invoiceError && <p role="alert">{invoiceError}</p>}
        {deliveryError && <p role="alert">{deliveryError}</p>}
        <fieldset className="ui-card ui-fieldset">
          <legend>Pengaturan PDF &amp; pengiriman</legend>
          <label className="ui-span-all">Tanda tangan PNG<input ref={signatureFileRef} type="file" accept="image/png" onChange={(event) => { const file = event.target.files?.[0]; if (!file) { setSignatureData(''); return; } const reader = new FileReader(); reader.onload = () => setSignatureData(String(reader.result)); reader.readAsDataURL(file); }} /></label>
          <label>Caption outbox<input value={enqueueCaption} onChange={event => setEnqueueCaption(event.target.value)} /></label>
          <label>Jadwal kirim<input type="datetime-local" value={enqueueScheduleAt} onChange={event => setEnqueueScheduleAt(event.target.value)} /></label>
        </fieldset>
        </details>
        <h3>Daftar nota</h3>{invoices.length === 0 ? <p>Belum ada nota. Buat tagihan pada tab Pembayaran.</p> : <ul>{invoices.map(invoice => { const paid = allPayments?.filter(payment => payment.invoiceId === invoice.id && payment.status === 'verified').reduce((sum, payment) => sum + payment.amount, 0); return <li key={invoice.id}>{invoice.number ?? 'Draft'} — Rp{invoice.total.toLocaleString('id-ID')} — {invoice.status === 'draft' ? 'Draft' : invoice.status === 'cancelled' ? 'Dibatalkan' : paid === undefined ? 'Status pembayaran tidak tersedia' : paid >= invoice.total ? 'Lunas' : `Sisa Rp${(invoice.total - paid).toLocaleString('id-ID')}`}{invoice.status === 'draft' && <button type="button" onClick={() => handleIssueInvoice(invoice)}>Terbitkan</button>}{(invoice.status === 'issued' || invoice.status === 'paid') && <button type="button" disabled={isProcessingDelivery === invoice.id} onClick={() => handleEnqueueDelivery(invoice.id)}>{isProcessingDelivery === invoice.id ? 'Menyiapkan...' : 'Buat PDF dan antrekan'}</button>}</li>; })}</ul>}
        <p>Pembayaran dikelola pada tab Pembayaran.</p>
      </section>
    }
    printerPanel={
      <section aria-labelledby="printer-title" className="printer-panel">
        <h2 id="printer-title">Printer PDF</h2>
        <p>Pilih nota terbit untuk membuat dan melihat PDF.</p>
        {invoicesLoading ? <p role="status">Memuat nota…</p> : invoiceError ? <p role="alert">{invoiceError}</p> : invoices.some(invoice => invoice.status === 'issued' || invoice.status === 'paid') ? <ul>{invoices.filter(invoice => invoice.status === 'issued' || invoice.status === 'paid').map(invoice => <li key={invoice.id}>{invoice.number ?? invoice.id} — {clients.find(client => client.id === invoice.clientId)?.name ?? 'Klien'}<button type="button" disabled={pdfLoading} onClick={() => handleGeneratePdf(invoice)}>Preview PDF</button></li>)}</ul> : <p>Belum ada nota terbit. Buka tab Nota, buat draft, lalu terbitkan nota.</p>}
        {pdfLoading && <p role="status">Membuat PDF…</p>}
        {pdfError && <p role="alert">{pdfError}</p>}
        {pdfPreview && pdfPreview.owner === userEmail && <div className="pdf-preview"><h3>Preview {pdfPreview.label}</h3><iframe title={`Preview PDF ${pdfPreview.label}`} src={`/api/invoice-pdfs/${pdfPreview.id}`} /><a href={`/api/invoice-pdfs/${pdfPreview.id}`} target="_blank" rel="noopener noreferrer">Buka atau unduh PDF</a></div>}
      </section>
    }
    archivePanel={
      <section aria-labelledby="archive-title">
        <h2 id="archive-title">Klien &amp; arsip</h2>
        <h3>{editingClientId ? 'Edit klien' : 'Tambah klien'}</h3>
        <form onSubmit={handleSaveClient} className="finance-form">
          <label>Nama klien<input id="client-name" required maxLength={120} value={clientName} onChange={event => setClientName(event.target.value)} /></label>
          <label>Nomor WhatsApp<input required value={clientPhone} onChange={event => setClientPhone(event.target.value)} /></label>
          <label>Email (opsional)<input type="email" value={clientEmail} onChange={event => setClientEmail(event.target.value)} /></label>
          <label>Alamat (opsional, dicetak di nota)<input maxLength={300} value={clientAddress} onChange={event => setClientAddress(event.target.value)} /></label>
          <div className="finance-actions"><button type="submit" disabled={clientBusy}>{clientBusy ? 'Menyimpan...' : editingClientId ? 'Simpan perubahan' : 'Simpan klien'}</button>{editingClientId && <button type="button" className="secondary-button" disabled={clientBusy} onClick={() => { clearClientForm(); setClientError(null); setClientNotice(null); }}>Batal edit</button>}</div>
        </form>
        {clientError && <p role="alert">{clientError}</p>}{clientLoadError && <p role="alert">{clientLoadError}</p>}{clientNotice && <p role="status">{clientNotice}</p>}
        <label>Cari klien<input value={clientSearch} onChange={event => setClientSearch(event.target.value)} /></label>
        <h3>Klien</h3>
        {matchingClients.length === 0 ? <p>{clientLoadError && clients.length === 0 ? 'Daftar klien belum tersedia.' : clients.length === 0 ? 'Belum ada klien yang disimpan.' : 'Tidak ada klien yang cocok dengan pencarian.'}</p> :
          <ul className="finance-list">{matchingClients.map(client => { const invoiceCount = invoices.filter(invoice => invoice.clientId === client.id).length; return <li key={client.id}>
            <strong>{client.name}</strong><span>{client.phone}</span>{client.email && <span>{client.email}</span>}{client.address && <span>{client.address}</span>}
            {!invoicesLoading && !invoiceError && <span>{invoiceCount ? `${invoiceCount} nota terkait` : 'Tidak ada nota terkait'}</span>}
            <div className="finance-actions"><button type="button" disabled={clientBusy} aria-label={`Edit ${client.name}, ${invoiceCount} nota terkait`} onClick={() => editClient(client)}>Edit</button><button type="button" className="secondary-button" disabled={clientBusy || invoiceCount > 0} title={invoiceCount ? 'Klien memiliki nota terkait' : undefined} aria-label={`Hapus ${client.name}, ${invoiceCount} nota terkait`} onClick={() => void handleDeleteClient(client)}>Hapus</button></div>
          </li>; })}</ul>}
        <h3>Nota</h3>{invoices.length === 0 ? <p>Belum ada nota di arsip.</p> : <ul>{invoices.map(invoice => <li key={invoice.id}>{invoice.number ?? 'Draft'} - Rp{invoice.total.toLocaleString('id-ID')} - {invoice.status}</li>)}</ul>}
      </section>
    }
    communicationPanel={
      <div className="comm-page">
        <section className="ui-card" aria-labelledby="wa-title">
          <div className="ui-row">
            <div>
              <h3 id="wa-title" className="ui-card-title">WhatsApp kantor</h3>
              <p className="ui-meta">Masuk sebagai {userEmail}</p>
            </div>
            <span
              role="status"
              className={`ui-badge ui-badge--${pairStatus?.status === 'connected' ? 'success' : pairStatus?.status === 'error' ? 'danger' : pairStatus?.status === 'pairing' ? 'warn' : pairStatus?.status === 'connecting' ? 'info' : 'neutral'}`}
            >
              {pairStatusError ? 'Status tidak tersedia' : !pairStatus ? 'Memeriksa...' : pairStatus.status === 'connected' ? 'Terhubung' : pairStatus.status === 'error' ? 'Error' : pairStatus.status === 'pairing' ? 'Menunggu scan' : pairStatus.status === 'connecting' || pairStatus.status === 'reconnecting' ? 'Menghubungkan' : 'Belum terhubung'}
            </span>
          </div>

          {pairStatusError && <div className="ui-alert ui-alert--danger" role="alert">{pairStatusError} <button type="button" className="text-button" onClick={() => void fetchPairStatus()}>Coba lagi</button></div>}
          {pairStatus?.error && <div className="ui-alert ui-alert--danger" role="alert">{pairStatus.error}</div>}

          {(pairStatus?.status === 'unpaired' || pairStatus?.status === 'logged_out') && (
            <div className="ui-row">
              <p className="ui-meta">WhatsApp belum terhubung ke sesi profil <code>synectra-office</code>.</p>
              <button type="button" className="primary-button" onClick={handleStartPairing}>Mulai pairing QR</button>
            </div>
          )}

          {(pairStatus?.status === 'connecting' || pairStatus?.status === 'reconnecting') && <p className="ui-meta">Menghubungkan ke WhatsApp bridge…</p>}

          {pairStatus?.status === 'pairing' && (
            <div className="comm-qr">
              <p className="ui-meta">
                Pindai QR ini melalui aplikasi WhatsApp di ponsel: <strong>Setelan → Perangkat tertaut → Tautkan perangkat</strong>
              </p>
              {pairStatus?.qrCode && pairStatus?.qrCode.startsWith('<svg') ? (
                <div className="comm-qr-code" dangerouslySetInnerHTML={{ __html: pairStatus?.qrCode }} />
              ) : (
                <pre className="ui-code">{pairStatus?.qrCode || 'Memuat QR…'}</pre>
              )}
            </div>
          )}

          {pairStatus?.status === 'connected' && (
            <>
              <div className="ui-alert ui-alert--success">
                <strong>WhatsApp terhubung.</strong>
                {pairStatus?.user && <> {pairStatus?.user.name ? `${pairStatus?.user.name} (${pairStatus?.user.id})` : pairStatus?.user.id}</>}
              </div>
              <div className="ui-row">
                <p className="ui-meta">Nota pembayaran baru dikirim otomatis. Periksa statusnya di bawah atau di riwayat pembayaran.</p>
                <button type="button" className="text-button ui-danger-text" onClick={handleDisconnectWhatsapp}>Putuskan WhatsApp</button>
              </div>
            </>
          )}
        </section>

        <section className="ui-stack" aria-labelledby="deliveries-title">
          <h3 id="deliveries-title" className="ui-section-label">Outbox pengiriman nota PDF <span>{deliveries.length}</span></h3>
          {deliveryError && <div className="ui-alert ui-alert--danger" role="alert">{deliveryError}</div>}
          {deliveries.length === 0 ? (
            <p className="ui-empty">Belum ada antrean pengiriman nota.</p>
          ) : (
            deliveries.map(({ delivery, approval, attempts }) => (
              <article key={delivery.id} className="ui-card">
                <div className="ui-row">
                  <strong className="ui-card-title">Nota {approval?.notaId ?? '-'}</strong>
                  <span className={`ui-badge ui-badge--${delivery.status === 'submitted' ? 'success' : delivery.status === 'failed' ? 'danger' : delivery.status === 'sending' ? 'info' : 'neutral'}`}>
                    {delivery.status}
                  </span>
                </div>

                <dl className="comm-meta">
                  <div><dt>Penerima</dt><dd><code>{approval?.recipient ?? '-'}</code></dd></div>
                  <div><dt>Jadwal</dt><dd>{approval?.scheduleAt ? new Date(approval.scheduleAt).toLocaleString('id-ID') : '-'}</dd></div>
                  <div><dt>Percobaan</dt><dd>{delivery.attemptCount}x</dd></div>
                  <div className="ui-span-all"><dt>Caption</dt><dd>{approval?.caption ?? '-'}</dd></div>
                </dl>

                <div className="ui-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isProcessingDelivery === delivery.id || pairStatus?.status !== 'connected'}
                    title={pairStatus?.status !== 'connected' ? 'Hubungkan WhatsApp terlebih dahulu' : undefined}
                    onClick={() => handleSendBridge(delivery.id)}
                  >
                    {isProcessingDelivery === delivery.id ? 'Mengirim…' : 'Kirim via WhatsApp'}
                  </button>
                  {approval && (
                    <>
                      <a className="secondary-button" href={`/api/deliveries/${delivery.id}/pdf`} target="_blank" rel="noopener noreferrer">Unduh PDF</a>
                      <a className="secondary-button" href={formatWaLink(approval.recipient, approval.caption)} target="_blank" rel="noopener noreferrer">Buka wa.me</a>
                    </>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={manualAttemptDeliveryId === delivery.id}
                    onClick={() => setManualAttemptDeliveryId(manualAttemptDeliveryId === delivery.id ? null : delivery.id)}
                  >
                    {manualAttemptDeliveryId === delivery.id ? 'Tutup catatan' : 'Catat pengiriman manual'}
                  </button>
                </div>

                {manualAttemptDeliveryId === delivery.id && (
                  <form
                    className="comm-manual"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRecordManualAttempt(delivery.id);
                    }}
                  >
                    <label>
                      Hasil
                      <select value={manualAttemptResult} onChange={(e) => setManualAttemptResult(e.target.value as 'sent' | 'failed' | 'unknown')}>
                        <option value="sent">Terkirim</option>
                        <option value="failed">Gagal</option>
                        <option value="unknown">Tidak pasti</option>
                      </select>
                    </label>
                    <label>
                      Catatan
                      <input value={manualAttemptNotes} onChange={(e) => setManualAttemptNotes(e.target.value)} placeholder="Dikirim manual via web atau nomor lain" />
                    </label>
                    <div className="ui-actions ui-actions--end">
                      <button type="submit" className="primary-button" disabled={isProcessingDelivery === delivery.id}>
                        {isProcessingDelivery === delivery.id ? 'Menyimpan…' : 'Simpan catatan'}
                      </button>
                    </div>
                  </form>
                )}

                {attempts.length > 0 && (
                  <div className="comm-attempts">
                    <span className="ui-meta">Riwayat percobaan</span>
                    <ul>
                      {attempts.map((att) => (
                        <li key={att.id}>
                          <span>#{att.attemptNumber} · {att.source ?? 'bridge'} · <strong>{att.result}</strong></span>
                          {att.messageId && <span> · ID {att.messageId}</span>}
                          {att.error && <span className="ui-danger-text"> · {att.error}</span>}
                          {att.notes && <span> · {att.notes}</span>}
                          <time dateTime={att.createdAt}>{new Date(att.createdAt).toLocaleTimeString('id-ID')}</time>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    }
    calendarPanel={<CalendarSchedulePanel csrfToken={csrfToken} />}
  />;
}

createRoot(document.getElementById('root')!).render(<App />);
