import type { ExpansionRoomId } from './types';

export type OfficeObjectId = 'hermes' | 'admin' | 'communication' | 'reception' | 'board' | 'calendar' | 'printer' | 'archive' | 'coffee' | 'lounge' | 'terrace';
export const officeObjects: Record<OfficeObjectId, {
  name: string; role: string; description: string;
}> = {
  hermes: { name: 'Hermes', role: 'Lead · area kerja', description: 'Tempat menyusun ide, membahas pekerjaan, dan meninjau hasil bersama Hermes.' },
  admin: { name: 'Administrasi', role: 'Nota & pembayaran', description: 'Meja administrasi menjadi pintu masuk nota, pembayaran, dan dokumen bisnis.' },
  communication: { name: 'Komunikasi', role: 'WhatsApp & pengiriman', description: 'Periksa koneksi WhatsApp dan kelola komunikasi dari meja ini.' },
  reception: { name: 'Pemilik', role: 'Ruang pemilik', description: 'Jelajahi ruangan atau ajak pemilik beristirahat sejenak.' },
  board: { name: 'Papan tugas', role: 'Ruang rapat', description: 'Tugas di papan ini dikerjakan otomatis oleh Lead Hermes melalui gateway Hermes.' },
  calendar: { name: 'Jadwal', role: 'Kalender kantor', description: 'Tempat meninjau jadwal kerja dan riwayat otomasi setelah layanan jadwal tersedia.' },
  printer: { name: 'Printer', role: 'Dokumen & PDF', description: 'Akses preview PDF dan riwayat revisi nota dari printer administrasi.' },
  archive: { name: 'Arsip', role: 'Nota & klien', description: 'Lemari arsip akan terhubung dengan pencarian nota dan data klien.' },
  coffee: { name: 'Seduh kopi', role: 'Pantry', description: 'Istirahat sebentar. Ajak pemilik berjalan ke pantry dan menikmati secangkir kopi.' },
  lounge: { name: 'Lounge', role: 'Ruang istirahat', description: 'Sudut nyaman untuk jeda. Ajak pemilik duduk dan menikmati suasana kantor.' },
  terrace: { name: 'Teras Kolam', role: 'Relaksasi & kolam', description: 'Teras santai luar ruangan dengan kolam air turquoise #388DA7 untuk rehat sejenak.' },
};

export interface ExpansionRoom {
  id: ExpansionRoomId;
  name: string;
  category: 'outdoor' | 'creative' | 'leisure';
  status: 'active' | 'concept';
  accentColor: string;
  description: string;
  budgetNotes: string;
}

export const expansionRooms: Record<ExpansionRoomId, ExpansionRoom> = {
  terrace: {
    id: 'terrace',
    name: 'Teras Kolam Renang',
    category: 'outdoor',
    status: 'active',
    accentColor: '#388DA7',
    description: 'Area santai luar ruangan berlantai dek kayu dengan kolam renang turquoise.',
    budgetNotes: 'Teras 3D terintegrasi dengan kontrol kualitas visual.',
  },
  studio: {
    id: 'studio',
    name: 'Studio Kreatif & Podcast',
    category: 'creative',
    status: 'concept',
    accentColor: '#8B5CF6',
    description: 'Ruang produksi konten, rekaman audio, dan visual kreatif tim spesialis.',
    budgetNotes: 'Rencana fase ekspansi, fallback visual panel saat scene tambahan belum aktif.',
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming & Chill Room',
    category: 'leisure',
    status: 'concept',
    accentColor: '#EC4899',
    description: 'Zona rekreasi tim dengan simulator dan konsol relaksasi.',
    budgetNotes: 'Rencana fase ekspansi, hemat komputasi tanpa beban komputasi tambahan.',
  },
};

export const team = [
  { id: 'hermes', name: 'Hermes', role: 'Lead', color: '#9eafc7' },
  { id: 'admin', name: 'Administrasi', role: 'Dokumen', color: '#7caee1' },
  { id: 'communication', name: 'Komunikasi', role: 'Pengiriman', color: '#9fbba2' },
  { id: 'reception', name: 'Pemilik', role: 'Kantor Anda', color: '#c5a9a0' },
] satisfies { id: OfficeObjectId; name: string; role: string; color: string }[];
