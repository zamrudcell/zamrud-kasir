// Cache data yang sering dipakai (staf, kategori, produk)
import { api } from './api.js';

const cache = {};
async function ambilCache(kunci, fn, umur = 30000) {
  const c = cache[kunci];
  if (c && Date.now() - c.t < umur) return c.v;
  const v = await fn();
  cache[kunci] = { v, t: Date.now() };
  return v;
}
export const hapusCache = (k) => { if (k) delete cache[k]; else for (const x in cache) delete cache[x]; };

export const dataStaf = () => ambilCache('staf', () => api.ambil('staf', { order: 'kode.asc' }));
export async function petaStaf() {
  const s = await dataStaf();
  return Object.fromEntries(s.map(x => [x.id, x]));
}
export const dataKategori = () => ambilCache('kategori', () => api.ambil('kategori', { order: 'nama.asc' }));
export const dataProduk = (semua = false) => ambilCache('produk' + (semua ? 'S' : ''),
  () => api.ambil('produk', { order: 'nama.asc', semua: true, ...(semua ? {} : { eq: { aktif: 'true' } }) }), 15000);
