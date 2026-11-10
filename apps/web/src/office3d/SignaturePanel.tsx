import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { resizeSignatureCanvas } from './signature-canvas';

export function SignaturePanel({ csrfToken, onSaved }: { csrfToken: string | null; onSaved: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setPreview(null); setPreviewError(''); setPreviewLoading(true);
    fetch('/api/signatures/current', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Pratinjau tanda tangan gagal dimuat.');
        const blob = await response.blob();
        if (controller.signal.aborted) return null;
        objectUrl = URL.createObjectURL(blob);
        return objectUrl;
      })
      .then(url => { if (!controller.signal.aborted) setPreview(url); })
      .catch(() => { if (!controller.signal.aborted) setPreviewError('Pratinjau tanda tangan gagal dimuat. Coba lagi.'); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [previewRevision]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { penColor: '#111111' });
    padRef.current = pad;
    const markChanged = () => { setEmpty(pad.isEmpty()); setMessage(''); setError(''); };
    pad.addEventListener('endStroke', markChanged);
    const previous = { width: 0, height: 0 };
    const resize = () => resizeSignatureCanvas(canvas, pad, previous, window.devicePixelRatio);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => { observer.disconnect(); pad.removeEventListener('endStroke', markChanged); pad.off(); padRef.current = null; };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true); setMessage(''); setError('');
  };

  const save = async () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty() || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify({ data: pad.toDataURL('image/png') })
      });
      if (!response.ok) throw new Error('Tanda tangan gagal disimpan. Coba lagi.');
      onSaved();
      pad.clear(); setEmpty(true);
      setPreviewRevision(revision => revision + 1);
      setMessage('Tanda tangan tersimpan dan akan digunakan untuk PDF baru.');
    } catch {
      setError('Tanda tangan gagal disimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="signature-panel" aria-labelledby="signature-title">
    <div className="signature-saved">
      <h3>Tanda tangan tersimpan</h3>
      {previewLoading ? <p role="status">Memuat tanda tangan…</p> : previewError ? <><p role="alert">{previewError}</p><button type="button" className="secondary-button" onClick={() => setPreviewRevision(revision => revision + 1)}>Coba lagi</button></> : preview ? <img src={preview} alt="Tanda tangan yang tersimpan" /> : <p>Belum ada tanda tangan tersimpan.</p>}
    </div>
    <h3 id="signature-title">Buat tanda tangan</h3>
    <p>Gambar dengan mouse, pena, atau jari. Tanda tangan yang disimpan digunakan pada PDF yang dibuat berikutnya.</p>
    <canvas ref={canvasRef} className="signature-canvas" aria-label="Area gambar tanda tangan" aria-describedby="signature-help" style={{ pointerEvents: saving ? 'none' : undefined }} />
    <p id="signature-help">Untuk menggunakan keyboard, unggah gambar PNG pada tab Nota.</p>
    <div className="signature-actions">
      <button type="button" className="secondary-button" onClick={clear} disabled={empty || saving}>Hapus</button>
      <button type="button" className="secondary-button" onClick={save} disabled={empty || saving}>{saving ? 'Menyimpan…' : 'Simpan tanda tangan'}</button>
    </div>
    {message && <p className="ui-toast" role="status">{message}</p>}
    {error && <p className="ui-toast" role="alert">{error}</p>}
  </section>;
}
