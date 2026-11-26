// Sesi karyawan (kode + PIN) & kunci otomatis saat tidak dipakai
import { api } from './api.js';

const KUNCI = 'zk_staf';
let staf = null;
try { staf = JSON.parse(sessionStorage.getItem(KUNCI) || 'null'); } catch { staf = null; }

const pendengar = new Set();
export const sesi = {
  get staf() { return staf; },
  get owner() { return staf?.peran === 'owner'; },
  get bisaJual() { return staf && (staf.peran === 'owner' || staf.peran === 'kasir'); },
  pengaturan: null,

  set(s) {
    staf = s;
    try { s ? sessionStorage.setItem(KUNCI, JSON.stringify(s)) : sessionStorage.removeItem(KUNCI); } catch {}
    pendengar.forEach(f => f(s));
  },
  saatBerubah(f) { pendengar.add(f); return () => pendengar.delete(f); },

  async masuk(kode, pin) {
    const s = await api.rpc('masuk_staf', { p_kode: kode, p_pin: pin });
    sesi.set(s); tandaiAktif();
    return s;
  },
  async keluar() {
    if (staf) { try { await api.rpc('keluar_staf', { p_token: staf.token }); } catch {} }
    sesi.set(null);
  },
};

// panggil RPC yang butuh token sesi; bila sesi habis -> minta PIN lagi
export let saatSesiHabis = () => {};
export function aturSaatSesiHabis(f) { saatSesiHabis = f; }

export async function aksi(nama, args = {}) {
  if (!staf) { saatSesiHabis('Silakan masuk dengan kode & PIN'); throw new Error('Belum masuk'); }
  tandaiAktif();
  try {
    return await api.rpc(nama, { p_token: staf.token, ...args });
  } catch (e) {
    if (['SESI_HABIS', 'DILUAR_SHIFT', 'STAF_NONAKTIF'].includes(e.kode)) {
      sesi.set(null);
      saatSesiHabis(e.message);
    }
    throw e;
  }
}

// ---------- kunci otomatis ----------
let terakhir = Date.now();
let pemantau = null;
export let saatTerkunci = () => {};
export function aturSaatTerkunci(f) { saatTerkunci = f; }
export let terkunci = false;
export function setTerkunci(v) { terkunci = v; }

function tandaiAktif() { terakhir = Date.now(); }
export function mulaiPemantauKunci() {
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, tandaiAktif, { passive: true }));
  clearInterval(pemantau);
  pemantau = setInterval(() => {
    if (!staf || terkunci) return;
    const menit = Number(sesi.pengaturan?.menit_kunci) || 2;
    if (Date.now() - terakhir > menit * 60000) saatTerkunci();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && staf && !terkunci) {
      const menit = Number(sesi.pengaturan?.menit_kunci) || 2;
      if (Date.now() - terakhir > menit * 60000) saatTerkunci();
    }
  });
}
