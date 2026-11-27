// Grafik arus harian: uang masuk (penjualan + bayar servis), barang masuk (nilai modal), pengeluaran
import { api } from './api.js';
import { esc, rp, geserHari, awalHari, akhirHari } from './ui.js';
import { dataProduk } from './data.js';

const SERI = [
  { k: 'uang', nama: 'Pemasukan uang', kelas: 's-uang' },
  { k: 'barang', nama: 'Barang masuk', kelas: 's-barang' },
  { k: 'keluar', nama: 'Pengeluaran', kelas: 's-keluar' },
];
const tglLokal = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });
const ringkas = (n) => n >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + 'M' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'jt' : n >= 1e3 ? Math.round(n / 1e3) + 'rb' : String(Math.round(n));

export async function dataArus(dari, sampai) {
  const rentang = { gte: { dibuat: awalHari(dari) }, lte: { dibuat: akhirHari(sampai) } };
  const [trx, bayar, mutasi, keluar, produk] = await Promise.all([
    api.ambil('transaksi', { select: 'total,dibuat', eq: { status: 'selesai' }, ...rentang, semua: true }),
    api.ambil('servis_bayar', { select: 'nominal,dibuat', ...rentang, semua: true }),
    api.ambil('stok_mutasi', { select: 'produk_id,qty,dibuat', eq: { jenis: 'masuk' }, ...rentang, semua: true }),
    api.ambil('pengeluaran', { select: 'nominal,tanggal', gte: { tanggal: dari }, lte: { tanggal: sampai }, semua: true }),
    dataProduk(true),
  ]);
  const hargaBeli = Object.fromEntries(produk.map(p => [p.id, Number(p.harga_beli) || 0]));
  const hari = [];
  for (let t = dari; t <= sampai && hari.length < 400; t = geserHari(t, 1)) hari.push({ tgl: t, uang: 0, barang: 0, keluar: 0 });
  const peta = Object.fromEntries(hari.map(h => [h.tgl, h]));
  const tambah = (t, k, n) => { if (peta[t]) peta[t][k] += Number(n) || 0; };
  trx.forEach(x => tambah(tglLokal(x.dibuat), 'uang', x.total));
  bayar.forEach(x => tambah(tglLokal(x.dibuat), 'uang', x.nominal));
  mutasi.forEach(x => tambah(tglLokal(x.dibuat), 'barang', Math.max(0, x.qty) * (hargaBeli[x.produk_id] || 0)));
  keluar.forEach(x => tambah(String(x.tanggal).slice(0, 10), 'keluar', x.nominal));
  return hari;
}

function gambar(svgWadah, hari) {
  const W = Math.max(280, svgWadah.clientWidth), H = svgWadah.clientHeight || 220;
  const kiri = 40, bawah = 22, atas = 8, lebarIsi = W - kiri - 6, tinggiIsi = H - bawah - atas;
  const maks = Math.max(1, ...hari.flatMap(h => [h.uang, h.barang, h.keluar]));
  const grup = lebarIsi / hari.length, bw = Math.max(1.5, Math.min(14, grup * .78 / 3));
  const y = (n) => atas + tinggiIsi - n / maks * tinggiIsi;
  const garis = [0, .5, 1].map(f => `<line x1="${kiri}" x2="${W - 6}" y1="${y(maks * f)}" y2="${y(maks * f)}" class="g-garis"/><text x="${kiri - 6}" y="${y(maks * f) + 4}" text-anchor="end">${ringkas(maks * f)}</text>`).join('');
  const lompat = Math.ceil(hari.length / Math.max(4, Math.floor(lebarIsi / 34)));
  const batang = hari.map((h, i) => {
    const x0 = kiri + i * grup + (grup - bw * 3) / 2;
    const b = SERI.map((s, j) => { const t = Math.max(h[s.k] ? 2 : 0, tinggiIsi - (y(h[s.k]) - atas)); return t ? `<rect class="${s.kelas}" style="--i:${i}" x="${x0 + j * bw}" y="${atas + tinggiIsi - t}" width="${bw - 1}" height="${t}" rx="${Math.min(3, bw / 3)}"><title>${esc(h.tgl)} · ${s.nama}: ${rp(h[s.k])}</title></rect>` : ''; }).join('');
    const lbl = i % lompat === 0 ? `<text x="${kiri + i * grup + grup / 2}" y="${H - 6}" text-anchor="middle">${h.tgl.slice(8, 10)}</text>` : '';
    return b + lbl;
  }).join('');
  svgWadah.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${garis}${batang}</svg>`;
}

// tampilkan grafik ke elemen; kembalikan data harian
export async function grafikArus(el, dari, sampai, { judul = 'Arus uang & barang', kecil = false } = {}) {
  el.innerHTML = `<div class="kartu-kepala"><h3>${judul}</h3></div><div class="arus-fig${kecil ? ' kecil' : ''}"><div class="memuat"><span></span><span></span><span></span></div></div><div class="arus-leg"></div>`;
  const hari = await dataArus(dari, sampai);
  const fig = el.querySelector('.arus-fig');
  const jumlah = Object.fromEntries(SERI.map(s => [s.k, hari.reduce((a, h) => a + h[s.k], 0)]));
  el.querySelector('.arus-leg').innerHTML = SERI.map(s => `<div><i class="${s.kelas}"></i><span>${s.nama}</span><b class="angka">${rp(jumlah[s.k])}</b></div>`).join('');
  gambar(fig, hari);
  let lebar = fig.clientWidth;
  const ro = new ResizeObserver(() => { if (!fig.isConnected) return ro.disconnect(); if (Math.abs(fig.clientWidth - lebar) > 4) { lebar = fig.clientWidth; gambar(fig, hari); } });
  ro.observe(fig);
  return { hari, jumlah };
}
