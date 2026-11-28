// Klien Supabase ringan (tanpa library): Auth + REST + RPC
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const KUNCI_AUTH = 'zk_auth';
let auth = null;
try { auth = JSON.parse(localStorage.getItem(KUNCI_AUTH) || 'null'); } catch { auth = null; }

function simpanAuth(a) {
  auth = a;
  try { a ? localStorage.setItem(KUNCI_AUTH, JSON.stringify(a)) : localStorage.removeItem(KUNCI_AUTH); } catch {}
}

export class ApiError extends Error {
  constructor(pesan, kode) { super(pesan); this.kode = kode; }
}

// ubah pesan error server "KODE: teks" -> {kode, teks}
function rapikanError(body, status) {
  let m = (body && (body.message || body.msg || body.error_description || body.error)) || ('Gagal (' + status + ')');
  let kode = '';
  const k = /^([A-Z_]{4,}):?\s*(.*)$/.exec(m);
  if (k) { kode = k[1]; m = k[2] || k[1].replace(/_/g, ' ').toLowerCase(); }
  if (/Invalid login credentials/i.test(m)) m = 'Email atau sandi salah';
  if (/permission denied/i.test(m)) m = 'Akses ditolak';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Tidak ada koneksi internet';
  return new ApiError(m, kode);
}

// token sesi karyawan dikirim di header agar database tahu siapa yang meminta (owner / bukan)
let tokenStaf = null;
export const setTokenStaf = (t) => { tokenStaf = t || null; };
// kolom yang boleh dibaca semua karyawan (modal / harga beli hanya lewat fungsi khusus owner)
const KOLOM = {
  produk: 'id,kode,barcode,nama,kategori_id,harga_jual,harga_member,stok,stok_minimum,satuan,garansi_hari,aktif,dibuat,diubah',
  transaksi: 'id,nomor,staf_id,pelanggan_id,member_id,subtotal,diskon,total,bayar,kembali,metode,catatan,status,batal_oleh,batal_alasan,batal_waktu,dibuat',
  transaksi_item: 'id,transaksi_id,produk_id,nama,qty,harga,diskon,subtotal,gratis,promo_id,garansi_hari,qty_retur',
  servis_sparepart: 'id,servis_id,produk_id,nama,qty,harga,gratis,promo_id,staf_id,dibuat',
  opname_item: 'opname_id,produk_id,stok_sistem,stok_fisik,diisi_oleh,diisi_waktu',
};

async function minta(path, { method = 'GET', body, headers = {}, tanpaToken = false } = {}) {
  if (!tanpaToken) await pastikanTokenSegar();
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(auth && !tanpaToken ? { Authorization: 'Bearer ' + auth.access_token } : {}),
        ...(tokenStaf ? { 'x-staf-token': tokenStaf } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) { throw new ApiError('Tidak ada koneksi internet', 'OFFLINE'); }
  const teks = await res.text();
  let data = null;
  try { data = teks ? JSON.parse(teks) : null; } catch { data = teks; }
  if (!res.ok) {
    if (res.status === 401 && !tanpaToken) { simpanAuth(null); }
    throw rapikanError(data, res.status);
  }
  return data;
}

let segarkan = null;
async function pastikanTokenSegar() {
  if (!auth) return;
  if (auth.expires_at && auth.expires_at - 60 > Date.now() / 1000) return;
  if (!segarkan) {
    segarkan = minta('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token }, tanpaToken: true })
      .then(d => simpanAuth({ ...d, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600) }))
      .catch(e => { simpanAuth(null); throw e; })
      .finally(() => { segarkan = null; });
  }
  return segarkan;
}

export const api = {
  get sudahMasuk() { return !!auth; },
  get email() { return auth?.user?.email || ''; },

  async masuk(email, sandi) {
    const d = await minta('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: sandi }, tanpaToken: true });
    simpanAuth({ ...d, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600) });
    return d;
  },

  async keluar() {
    try { await minta('/auth/v1/logout', { method: 'POST' }); } catch {}
    simpanAuth(null);
  },

  rpc(nama, args = {}) {
    return minta('/rest/v1/rpc/' + nama, { method: 'POST', body: args });
  },

  // ambil(tabel, { select, eq:{kol:val}, gte, lte, ilike, inn, or, order:'kol.desc', limit })
  async ambil(tabel, o = {}) {
    try { return await this._ambil(tabel, o); }
    catch (e) {
      // kolom baru belum ada (SQL terbaru belum dijalankan): ulangi tanpa kolom tambahan
      const kol = KOLOM[tabel];
      if (!o.select && kol && /harga_member|member_id/.test(e.message || '')) return this._ambil(tabel, { ...o, select: kol.split(',').filter(c => !['harga_member', 'member_id'].includes(c)).join(',') });
      throw e;
    }
  },

  _ambil(tabel, o = {}) {
    const q = new URLSearchParams();
    q.set('select', o.select || KOLOM[tabel] || '*');
    for (const [op, isi] of Object.entries({ eq: o.eq, neq: o.neq, gte: o.gte, lte: o.lte, lt: o.lt, gt: o.gt, ilike: o.ilike, is: o.is })) {
      if (!isi) continue;
      for (const [k, v] of Object.entries(isi)) if (v !== undefined && v !== null && v !== '') q.append(k, op + '.' + v);
    }
    if (o.inn) for (const [k, v] of Object.entries(o.inn)) q.append(k, 'in.(' + v.join(',') + ')');
    if (o.or) q.set('or', '(' + o.or + ')');
    if (o.order) q.set('order', o.order);
    if (o.limit) q.set('limit', o.limit);
    if (!o.semua) return minta('/rest/v1/' + tabel + '?' + q.toString());
    // ambil semua baris bertahap (server membatasi 1000 baris per permintaan)
    return (async () => {
      const hasil = []; const per = 1000;
      for (let off = 0; ; off += per) {
        q.set('limit', per); q.set('offset', off);
        const bagian = await minta('/rest/v1/' + tabel + '?' + q.toString());
        hasil.push(...bagian);
        if (bagian.length < per) break;
      }
      return hasil;
    })();
  },

  async satu(tabel, o = {}) {
    const r = await api.ambil(tabel, { ...o, limit: 1 });
    return r && r[0] || null;
  },
};
