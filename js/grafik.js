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

// kurva halus melewati titik (Catmull-Rom → Bezier), tidak melampaui batas atas/bawah
function kurva(t) {
  if (t.length < 2) return t.length ? `M${t[0][0]},${t[0][1]}` : '';
  let d = `M${t[0][0].toFixed(1)},${t[0][1].toFixed(1)}`;
  const ymin = Math.min(...t.map(p => p[1])), ymax = Math.max(...t.map(p => p[1]));
  const jepit = (y) => Math.max(ymin, Math.min(ymax, y));
  for (let i = 0; i < t.length - 1; i++) {
    const p0 = t[i - 1] || t[i], p1 = t[i], p2 = t[i + 1], p3 = t[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, jepit(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, jepit(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// grafik garis ala saham + kilatan "arus listrik" yang mengalir di sepanjang garis
function gambar(fig, hari) {
  const W = Math.max(280, fig.clientWidth), H = fig.clientHeight || 220;
  const kiri = 42, kanan = 10, bawah = 22, atas = 10, lebarIsi = W - kiri - kanan, tinggiIsi = H - bawah - atas;
  const maks = Math.max(1, ...hari.flatMap(h => [h.uang, h.barang, h.keluar])) * 1.08;
  const x = (i) => kiri + (hari.length < 2 ? lebarIsi / 2 : i / (hari.length - 1) * lebarIsi);
  const y = (n) => atas + tinggiIsi - n / maks * tinggiIsi;
  const garis = [0, .25, .5, .75, 1].map(f => `<line x1="${kiri}" x2="${W - kanan}" y1="${y(maks * f / 1.08)}" y2="${y(maks * f / 1.08)}" class="g-garis"/>${f % .5 === 0 ? `<text x="${kiri - 6}" y="${y(maks * f / 1.08) + 4}" text-anchor="end">${ringkas(maks * f / 1.08)}</text>` : ''}`).join('');
  const lompat = Math.ceil(hari.length / Math.max(4, Math.floor(lebarIsi / 38)));
  const label = hari.map((h, i) => i % lompat === 0 || i === hari.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${h.tgl.slice(8, 10)}</text>` : '').join('');
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const seri = SERI.map((s, j) => {
    const t = hari.map((h, i) => [x(i), y(h[s.k])]);
    const d = kurva(t), area = d + ` L${x(hari.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
    return `<defs><linearGradient id="${id}${j}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="${s.kelas}" stop-opacity=".32"/><stop offset="1" class="${s.kelas}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id}${j})" class="g-area"/>
      <path d="${d}" class="g-sinar ${s.kelas}"/>
      <path d="${d}" class="g-garis-seri ${s.kelas}" pathLength="1000"/>
      <path d="${d}" class="g-arus ${s.kelas}" pathLength="1000" style="animation-delay:${-j * .9}s"/>
      <circle cx="${t[t.length - 1][0]}" cy="${t[t.length - 1][1]}" r="3.5" class="g-ujung ${s.kelas}"/>`;
  }).join('');
  fig.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${garis}${label}${seri}<line class="g-kursor" x1="0" x2="0" y1="${atas}" y2="${atas + tinggiIsi}" hidden/></svg><div class="g-tip" hidden></div>`;
  // sentuh / arahkan untuk melihat angka per hari
  const svg = fig.querySelector('svg'), kursor = fig.querySelector('.g-kursor'), tip = fig.querySelector('.g-tip');
  const tunjuk = (e) => {
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
    const i = Math.max(0, Math.min(hari.length - 1, Math.round((px - kiri) / (lebarIsi / Math.max(1, hari.length - 1)))));
    const h = hari[i];
    kursor.setAttribute('x1', x(i)); kursor.setAttribute('x2', x(i)); kursor.hidden = false;
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(new Date(h.tgl + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }))}</b>` + SERI.map(s => `<span><i class="${s.kelas}"></i>${rp(h[s.k])}</span>`).join('');
    tip.style.left = Math.min(W - tip.offsetWidth - 4, Math.max(4, x(i) - tip.offsetWidth / 2)) + 'px';
  };
  svg.onpointerdown = svg.onpointermove = tunjuk;
  svg.onpointerleave = () => { kursor.hidden = true; tip.hidden = true; };
}

// grafik bulat (donat). bagian: [{nama, nilai, kelas}]
export function grafikDonat(el, judul, bagian, { tengah = 'Total' } = {}) {
  const isi = bagian.filter(b => b.nilai > 0), total = isi.reduce((a, b) => a + b.nilai, 0);
  const R = 52, K = 2 * Math.PI * R;
  let jalan = 0;
  const busur = isi.map((b, i) => {
    const pj = b.nilai / total * K, dash = Math.max(0, pj - (isi.length > 1 ? 2 : 0));
    const c = `<circle r="${R}" cx="70" cy="70" class="d-busur ${b.kelas}" data-i="${i}" style="--pj:${dash.toFixed(1)};--k:${K.toFixed(1)};--i:${i}" stroke-dashoffset="${(-jalan).toFixed(1)}"/>`;
    jalan += pj; return c;
  }).join('');
  el.innerHTML = `<div class="kartu-kepala"><h3>${judul}</h3></div>
    <div class="donat">
      <div class="donat-fig"><svg viewBox="0 0 140 140"><circle r="${R}" cx="70" cy="70" class="d-dasar"/>${busur}</svg>
        <div class="donat-tengah"><small>${esc(tengah)}</small><b class="angka">${ringkas(total)}</b></div></div>
      <div class="donat-leg">${bagian.map((b, i) => `<button data-i="${isi.indexOf(b)}"><i class="${b.kelas}"></i><span>${esc(b.nama)}</span><b class="angka">${rp(b.nilai)}</b><em>${total ? Math.round(b.nilai / total * 100) : 0}%</em></button>`).join('')}</div>
    </div>`;
  if (!total) el.querySelector('.donat-tengah b').textContent = '0';
  const tengahEl = el.querySelector('.donat-tengah');
  const sorot = (i) => {
    el.querySelectorAll('.d-busur').forEach(c => c.classList.toggle('redup', i >= 0 && c.dataset.i != i));
    const b = isi[i];
    tengahEl.innerHTML = b ? `<small>${esc(b.nama)}</small><b class="angka">${Math.round(b.nilai / total * 100)}%</b>` : `<small>${esc(tengah)}</small><b class="angka">${ringkas(total)}</b>`;
  };
  let aktif = -1;
  el.querySelectorAll('[data-i]').forEach(t => t.addEventListener('click', () => { const i = Number(t.dataset.i); aktif = aktif === i ? -1 : i; sorot(aktif); }));
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
