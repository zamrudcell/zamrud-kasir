// Cache data yang sering dipakai (staf, kategori, produk)
import { api } from './api.js';
import { sesi, aksi } from './sesi.js';

const cache = {};
async function ambilCache(kunci, fn, umur = 30000) {
  const c = cache[kunci];
  if (c && Date.now() - c.t < umur) return c.v;
  const v = await fn();
  cache[kunci] = { v, t: Date.now() };
  return v;
}
export const hapusCache = (k) => { for (const x in cache) if (!k || x.startsWith(k)) delete cache[x]; };

export const dataStaf = () => ambilCache('staf', () => api.ambil('staf', { order: 'kode.asc' }));
export async function petaStaf() {
  const s = await dataStaf();
  return Object.fromEntries(s.map(x => [x.id, x]));
}
export const dataKategori = () => ambilCache('kategori', () => api.ambil('kategori', { order: 'nama.asc' }));
export const dataProduk = (semua = false) => ambilCache('produk' + (semua ? 'S' : '') + (sesi.owner ? 'O' : ''), async () => {
  const [d, modal] = await Promise.all([
    api.ambil('produk', { order: 'nama.asc', semua: true, ...(semua ? {} : { eq: { aktif: 'true' } }) }),
    sesi.owner ? ambilModal('produk') : null,
  ]);
  if (modal) d.forEach(p => { p.harga_beli = modal[p.id] ?? 0; });
  return d;
}, 15000);

// cadangan sebelum SQL 003 dijalankan: baca kolom langsung (setelah 003 database menolaknya)
async function cadangan(tabel, ids) {
  try {
    const kol = tabel === 'transaksi' ? 'modal' : 'harga_beli', kunci = tabel === 'opname_item' ? 'produk_id' : 'id';
    const filter = !ids ? {} : { inn: { [tabel === 'opname_item' ? 'opname_id' : 'id']: ids } };
    const d = await api.ambil(tabel, { select: kunci + ',' + kol, semua: true, ...filter });
    return Object.fromEntries(d.map(x => [x[kunci], Number(x[kol]) || 0]));
  } catch { return {}; }
}

// modal / harga beli — hanya owner (database menolak karyawan). Hasil: { id: nilai }
export async function ambilModal(tabel, ids = null) {
  if (!sesi.owner || (ids && !ids.length)) return {};
  let r; try { r = await aksi('data_modal', { p_tabel: tabel, p_ids: ids }); } catch { return cadangan(tabel, ids); } // SQL 003 belum dijalankan
  return Object.fromEntries((r || []).map(x => [x.id, Number(x.nilai) || 0]));
}
