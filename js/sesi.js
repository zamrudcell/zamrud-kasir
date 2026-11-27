// Sesi karyawan (kode + PIN) & kunci otomatis saat tidak dipakai
import { api, setTokenStaf } from './api.js';

const KUNCI = 'zk_staf';
let staf = null;
// disimpan di perangkat (bukan hanya tab) agar tetap ada walau aplikasi ditutup HP; saat dibuka lagi cukup PIN
try { staf = JSON.parse(localStorage.getItem(KUNCI) || sessionStorage.getItem(KUNCI) || 'null'); } catch { staf = null; }
setTokenStaf(staf?.token);

const pendengar = new Set();
export const sesi = {
  get staf() { return staf; },
  get owner() { return staf?.peran === 'owner'; },
  get bisaJual() { return staf && (staf.peran === 'owner' || staf.peran === 'kasir'); },
  pengaturan: null,

  set(s) {
    staf = s; setTokenStaf(s?.token);
    try { s ? localStorage.setItem(KUNCI, JSON.stringify(s)) : localStorage.removeItem(KUNCI); sessionStorage.removeItem(KUNCI); } catch {}
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
    const menit = Number(sesi.pengaturan?.menit_kunci) || 10;
    if (Date.now() - terakhir > menit * 60000) saatTerkunci();
  }, 5000);
  // jaga sesi di server tetap hidup selama aplikasi benar-benar dipakai (tiap 4 menit)
  setInterval(() => {
    if (staf && !terkunci && document.visibilityState === 'visible' && Date.now() - terakhir < 4 * 60000)
      api.rpc('cek_sesi', { p_token: staf.token }).catch(() => {});
  }, 4 * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && staf && !terkunci) {
      const menit = Number(sesi.pengaturan?.menit_kunci) || 10;
      if (Date.now() - terakhir > menit * 60000) saatTerkunci();
    }
  });
}
