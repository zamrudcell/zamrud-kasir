// Nota 2 rangkap: Lembar Konsumen + Lembar Toko (untuk garansi)
import { esc, rp, tgl, angka } from './ui.js';
import { sesi } from './sesi.js';

export const ukuranNota = () => { try { return localStorage.getItem('zk_nota') || '58'; } catch { return '58'; } };
export const setUkuranNota = (v) => { try { localStorage.setItem('zk_nota', v); } catch {} };

function tambahHari(d, n) { const x = new Date(d); x.setDate(x.getDate() + Number(n || 0)); return x; }

function kepala(p) {
  return `<div class="n-kepala">
    <img src="assets/gem.png?v=2" alt="" class="n-logo">
    <div class="n-toko">${esc(p.nama_toko || 'ZAMRUD CELL')}</div>
    <div class="n-kecil">Service HP, iPhone, Android | Sparepart &amp; Aksesoris</div>
    ${p.alamat ? `<div class="n-kecil">${esc(p.alamat)}</div>` : ''}
    ${p.telepon ? `<div class="n-kecil">Telp/WA: ${esc(p.telepon)}</div>` : ''}
  </div>`;
}

function bungkus(isiFn, judul) {
  const p = sesi.pengaturan || {};
  const lembar = (jenis) => `<section class="nota u${ukuranNota()}">
      ${kepala(p)}
      <div class="n-jenis">${esc(judul)} — ${jenis}</div>
      ${isiFn(jenis)}
      <div class="n-garis"></div>
      <div class="n-kecil n-syarat">${esc(p.syarat_garansi || '')}</div>
      <div class="n-tengah n-terima">${esc(p.catatan_nota || 'Terima kasih')}</div>
    </section>`;
  return lembar('LEMBAR KONSUMEN') + lembar('LEMBAR TOKO');
}

export function notaTransaksi(t, items, { kasir = '', pelanggan = null } = {}) {
  return bungkus((jenis) => `
    <table class="n-info">
      <tr><td>No</td><td>: <b>${esc(t.nomor)}</b></td></tr>
      <tr><td>Tanggal</td><td>: ${tgl(t.dibuat)}</td></tr>
      <tr><td>Kasir</td><td>: ${esc(kasir)}</td></tr>
      ${pelanggan ? `<tr><td>Pelanggan</td><td>: ${esc(pelanggan.nama)}${pelanggan.hp ? ' (' + esc(pelanggan.hp) + ')' : ''}</td></tr>` : ''}
      ${t.member_id && pelanggan?.kode_member ? `<tr><td>Member</td><td>: ${esc(pelanggan.kode_member)} (harga member)</td></tr>` : ''}
    </table>
    ${t.status === 'batal' ? '<div class="n-batal">TRANSAKSI DIBATALKAN</div>' : ''}
    <div class="n-garis"></div>
    ${items.map(i => `<div class="n-item">
        <div class="n-nama">${esc(i.nama)}</div>
        <div class="n-baris"><span>${angka(i.qty)} x ${rp(i.harga)}</span><span>${i.gratis ? 'GRATIS' : rp(i.harga * i.qty)}</span></div>
        ${!i.gratis && i.diskon > 0 ? `<div class="n-baris n-kecil"><span>Promo</span><span>-${rp(i.diskon)}</span></div>` : ''}
        ${i.garansi_hari > 0 ? `<div class="n-kecil">Garansi ${i.garansi_hari} hari s/d ${tgl(tambahHari(t.dibuat, i.garansi_hari), false)}</div>` : '<div class="n-kecil">Tanpa garansi</div>'}
      </div>`).join('')}
    <div class="n-garis"></div>
    <div class="n-baris"><span>Subtotal</span><span>${rp(t.subtotal)}</span></div>
    ${t.diskon > 0 ? `<div class="n-baris"><span>Diskon</span><span>-${rp(t.diskon)}</span></div>` : ''}
    <div class="n-baris n-total"><span>TOTAL</span><span>${rp(t.total)}</span></div>
    <div class="n-baris"><span>Bayar (${esc(t.metode)})</span><span>${rp(t.bayar)}</span></div>
    ${t.kembali > 0 ? `<div class="n-baris"><span>Kembali</span><span>${rp(t.kembali)}</span></div>` : ''}
    ${jenis === 'LEMBAR TOKO' ? '<div class="n-ttd"><div>Kasir</div><div>Pelanggan</div></div>' : ''}
  `, 'NOTA PENJUALAN');
}

export function notaServis(v, spare = [], bayar = [], { tahap = 'terima' } = {}) {
  const totalSpare = spare.reduce((a, s) => a + (s.gratis ? 0 : s.harga * s.qty), 0);
  const total = Number(v.biaya_jasa || 0) + totalSpare;
  const dibayar = bayar.reduce((a, b) => a + Number(b.nominal), 0);
  const garansiSampai = v.diambil_waktu ? tambahHari(v.diambil_waktu, v.garansi_hari) : null;
  return bungkus((jenis) => `
    <table class="n-info">
      <tr><td>No Servis</td><td>: <b>${esc(v.nomor)}</b></td></tr>
      <tr><td>Masuk</td><td>: ${tgl(v.dibuat)}</td></tr>
      <tr><td>Pelanggan</td><td>: ${esc(v.nama)}${v.hp ? ' (' + esc(v.hp) + ')' : ''}</td></tr>
      <tr><td>HP</td><td>: ${esc([v.merek, v.tipe].filter(Boolean).join(' '))}</td></tr>
      ${v.imei ? `<tr><td>IMEI</td><td>: ${esc(v.imei)}</td></tr>` : ''}
      <tr><td>Penerima</td><td>: ${esc(v.nama_penerima || '')}</td></tr>
    </table>
    <div class="n-garis"></div>
    ${v.jenis_servis ? `<div><b>Servis:</b> ${esc(v.jenis_servis)}</div>` : ''}
    <div><b>Keluhan:</b> ${esc(v.keluhan || '-')}</div>
    ${v.kelengkapan ? `<div><b>Kelengkapan:</b> ${esc(v.kelengkapan)}</div>` : ''}
    ${v.kondisi ? `<div><b>Kondisi:</b> ${esc(v.kondisi)}</div>` : ''}
    <div class="n-garis"></div>
    ${tahap === 'terima' ? `
      <div class="n-baris"><span>Estimasi biaya</span><span>${rp(v.estimasi_biaya)}</span></div>
      <div class="n-baris"><span>DP</span><span>${rp(dibayar)}</span></div>
      <div class="n-kecil">Simpan nota ini untuk mengambil HP Anda.</div>`
    : `
      <div class="n-baris"><span>Jasa servis</span><span>${rp(v.biaya_jasa)}</span></div>
      ${spare.map(s => `<div class="n-baris"><span>${esc(s.nama)} x${s.qty}</span><span>${s.gratis ? 'GRATIS' : rp(s.harga * s.qty)}</span></div>`).join('')}
      <div class="n-baris n-total"><span>TOTAL</span><span>${rp(total)}</span></div>
      <div class="n-baris"><span>Dibayar</span><span>${rp(dibayar)}</span></div>
      ${total - dibayar > 0 ? `<div class="n-baris n-sisa"><span>SISA (BELUM LUNAS)</span><span>${rp(total - dibayar)}</span></div>` : '<div class="n-tengah"><b>LUNAS</b></div>'}
      ${garansiSampai ? `<div class="n-kecil">Garansi servis ${v.garansi_hari} hari s/d ${tgl(garansiSampai, false)}</div>` : ''}`}
    ${jenis === 'LEMBAR TOKO' ? '<div class="n-ttd"><div>Petugas</div><div>Pelanggan</div></div>' : ''}
  `, tahap === 'terima' ? 'TANDA TERIMA SERVIS' : 'NOTA SERVIS');
}

export function cetak(html, judul = 'Nota') {
  let w = document.getElementById('area-cetak');
  if (!w) { w = document.createElement('div'); w.id = 'area-cetak'; document.body.appendChild(w); }
  w.innerHTML = html;
  const judulLama = document.title; document.title = judul;
  document.body.classList.add('mode-cetak');
  const img = [...w.querySelectorAll('img')];
  Promise.all(img.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => {
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.body.classList.remove('mode-cetak'); document.title = judulLama; }, 500);
    }, 50);
  });
}
