import { useEffect, useState, type FormEvent } from 'react';
import type { BusinessProfile } from '@synectra/contracts';

const TEXT_FIELDS = ['businessName', 'signerName', 'address', 'phone', 'email', 'npwp', 'bankName', 'bankAccountNumber', 'bankAccountName', 'invoiceNotes'] as const;
type Form = Record<(typeof TEXT_FIELDS)[number], string>;

const emptyForm = Object.fromEntries(TEXT_FIELDS.map((key) => [key, ''])) as Form;

function toForm(profile: BusinessProfile): Form {
  return Object.fromEntries(TEXT_FIELDS.map((key) => [key, profile[key] ?? ''])) as Form;
}

/** Identitas usaha dan rekening tujuan yang dicetak di setiap nota PDF. */
export function BusinessProfilePanel({ csrfToken }: { csrfToken: string | null }) {
  const [saved, setSaved] = useState<BusinessProfile | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/business/profile', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load'))))
      .then(({ profile }: { profile: BusinessProfile | null }) => {
        setSaved(profile);
        if (profile) setForm(toForm(profile));
      })
      .catch(() => { if (!controller.signal.aborted) setError('Profil usaha gagal dimuat. Coba buka ulang tab ini.'); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, []);

  const set = (key: keyof Form) => (event: { target: { value: string } }) => { setForm((current) => ({ ...current, [key]: event.target.value })); setMessage(''); };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/business/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify({ ...saved, ...form })
      });
      if (!response.ok) throw new Error('Periksa kembali isian: nomor rekening hanya angka, NPWP 15–16 digit, email harus valid.');
      const { profile } = await response.json() as { profile: BusinessProfile };
      setSaved(profile); setForm(toForm(profile));
      setMessage('Profil tersimpan. Nota PDF berikutnya memakai data ini.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const incomplete = loaded && (!saved || !saved.bankAccountNumber);
  if (!loaded) return <p role="status" className="ui-meta">Memuat profil usaha…</p>;

  return <details className="ui-card profile-card" open={incomplete || undefined}>
    <summary>
      <span>Profil usaha &amp; pembayaran</span>
      {incomplete ? <span className="ui-badge ui-badge--warn">Belum lengkap</span> : <span className="ui-badge ui-badge--success">Lengkap</span>}
    </summary>
    <p className="ui-meta">Dicetak di setiap nota: identitas usaha dan rekening tujuan transfer.</p>
    <form onSubmit={save} className="ui-form profile-form">
      <h4 className="ui-span-all ui-form-group">Identitas usaha</h4>
      <label>Nama usaha<input required maxLength={120} value={form.businessName} onChange={set('businessName')} /></label>
      <label>Nama penanda tangan<input required maxLength={120} value={form.signerName} onChange={set('signerName')} /></label>
      <label className="ui-span-all">Alamat<input maxLength={300} value={form.address} onChange={set('address')} placeholder="Jl. …, Kota" /></label>
      <label>Telepon / WhatsApp<input maxLength={30} inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="6281…" /></label>
      <label>Email<input type="email" maxLength={120} value={form.email} onChange={set('email')} /></label>
      <label>NPWP (opsional)<input maxLength={25} inputMode="numeric" value={form.npwp} onChange={set('npwp')} placeholder="Hanya bila diperlukan" /></label>

      <h4 className="ui-span-all ui-form-group">Pembayaran</h4>
      <label>Bank<input maxLength={80} value={form.bankName} onChange={set('bankName')} placeholder="cth: BCA" /></label>
      <label>Nomor rekening<input maxLength={40} inputMode="numeric" value={form.bankAccountNumber} onChange={set('bankAccountNumber')} /></label>
      <label>Atas nama<input maxLength={120} value={form.bankAccountName} onChange={set('bankAccountName')} /></label>
      <label className="ui-span-all">Catatan di nota (opsional)<textarea maxLength={500} rows={2} value={form.invoiceNotes} onChange={set('invoiceNotes')} placeholder="cth: Denda 2% per bulan untuk keterlambatan pembayaran." /></label>

      {error && <p role="alert" className="ui-span-all">{error}</p>}
      {message && <p role="status" className="ui-span-all">{message}</p>}
      <div className="ui-actions ui-actions--end"><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button></div>
    </form>
  </details>;
}
