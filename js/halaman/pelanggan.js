import { api } from '../api.js';
import { esc, ikon, rp, tgl, $, $$, lembar, kosong, STATUS_SERVIS } from '../ui.js';
import { bukaServis } from './servis.js';
import { bukaTransaksi } from './transaksi.js';

async function detail(p) {
  const [servis, trx] = await Promise.all([
    api.ambil('v_servis', { eq: { pelanggan_id: p.id }, order: 'dibuat.desc', limit: 100 }),
    api.ambil('transaksi', { eq: { pelanggan_id: p.id }, order: 'dibuat.desc', limit: 100 }),
  ]);
  // kelompokkan servis per HP (IMEI)
  const hp = {};
  for (const v of servis) { const k = v.imei || ('(tanpa IMEI) ' + [v.merek, v.tipe].join(' ')); (hp[k] ||= []).push(v); }
  const belanja = trx.filter(t => t.status === 'selesai').reduce((a, t) => a + Number(t.total), 0);
  const l = lembar({ judul: p.nama, lebar: 620, isi: `
    <div class="grid-info"><div><small>No HP</small><b>${esc(p.hp || '-')}</b></div><div><small>Pelanggan sejak</small><b>${tgl(p.dibuat, false)}</b></div>
      <div><small>Total belanja</small><b>${rp(belanja)}</b></div><div><small>Jumlah servis</small><b>${servis.length}</b></div></div>
    ${p.hp ? `<a class="btn abu" href="https://wa.me/${esc(p.hp.replace(/^0/, '62').replace(/\D/g, ''))}" target="_blank" rel="noopener">${ikon('phone', 16)} Chat WhatsApp</a>` : ''}
    <h4 class="sub-judul">${ikon('phone', 16)} Riwayat servis per HP</h4>
    ${Object.keys(hp).length ? Object.entries(hp).map(([k, d]) => `<div class="kelompok-hp"><div class="kh-kepala">${ikon('phone', 16)} <b>${esc([d[0].merek, d[0].tipe].filter(Boolean).join(' '))}</b> <small class="mono">${esc(k)}</small> <span class="pil abu">${d.length}x</span></div>
      ${d.map(v => `<button class="baris-ringkas" data-sv="${v.id}"><span><b>${esc(v.nomor)}</b><small>${tgl(v.dibuat, false)} · ${esc(v.jenis_servis || v.keluhan)}</small></span><span class="pil ${STATUS_SERVIS[v.status].warna}">${STATUS_SERVIS[v.status].label}</span></button>`).join('')}</div>`).join('') : '<p class="redup">Belum pernah servis</p>'}
    <h4 class="sub-judul">${ikon('kasir', 16)} Riwayat belanja</h4>
    <div class="daftar-ringkas">${trx.map(t => `<button class="baris-ringkas" data-trx="${t.id}"><span><b>${esc(t.nomor)}</b><small>${tgl(t.dibuat)}</small></span><b class="${t.status === 'batal' ? 'coret' : ''}">${rp(t.total)}</b></button>`).join('') || '<p class="redup">Belum ada belanja</p>'}</div>` });
  $$('[data-sv]', l.el).forEach(b => b.onclick = () => { l.tutup(); bukaServis(b.dataset.sv); });
  $$('[data-trx]', l.el).forEach(b => b.onclick = () => { l.tutup(); bukaTransaksi(b.dataset.trx); });
}

export default {
  async tampil(el) {
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="kolom-cari lebar">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari nama / no HP pelanggan…"></div>
        <div class="kolom-cari">${ikon('phone', 18)}<input class="input mono" id="imei" placeholder="Cek riwayat IMEI…" inputmode="numeric"></div>
      </div>
      <div id="hasil-imei"></div>
      <div class="kartu daftar" id="daftar"></div>`;
    const muat = async (q = '') => {
      const d = await api.ambil('pelanggan', { or: q ? `nama.ilike.*${q.replace(/[(),]/g, ' ')}*,hp.ilike.*${q.replace(/[(),]/g, ' ')}*` : undefined, order: 'dibuat.desc', limit: 200 });
      $('#daftar', el).innerHTML = d.length ? d.map((p, i) => `<button class="baris-daftar muncul" style="--i:${Math.min(i, 15)}" data-id="${p.id}">
        <span class="avatar kecil">${esc(p.nama[0] || '?')}</span><span class="bd-utama"><b>${esc(p.nama)}</b><small>${esc(p.hp || '-')}</small></span>${ikon('chevron', 18)}</button>`).join('') : kosong('Belum ada pelanggan', 'users');
      $$('[data-id]', el).forEach(b => b.onclick = () => detail(d.find(p => p.id === b.dataset.id)));
    };
    let t; $('#q', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => muat(e.target.value.trim()), 300); };
    $('#imei', el).onkeydown = async (e) => {
      if (e.key !== 'Enter') return;
      const im = e.target.value.trim(); if (!im) return ($('#hasil-imei', el).innerHTML = '');
      const r = await api.ambil('v_servis', { ilike: { imei: '*' + im + '*' }, order: 'dibuat.desc', limit: 50 });
      $('#hasil-imei', el).innerHTML = `<div class="kartu muncul"><h3>${ikon('history', 18)} Riwayat IMEI ${esc(im)} (${r.length})</h3>
        ${r.map(v => `<button class="baris-ringkas" data-sv="${v.id}"><span><b>${esc(v.nomor)}</b> ${esc(v.nama)}<small>${tgl(v.dibuat, false)} · ${esc([v.merek, v.tipe].join(' '))} · ${esc(v.jenis_servis || v.keluhan)}</small></span><span class="pil ${STATUS_SERVIS[v.status].warna}">${STATUS_SERVIS[v.status].label}</span></button>`).join('') || '<p class="redup">Belum ada riwayat</p>'}</div>`;
      $$('[data-sv]', $('#hasil-imei', el)).forEach(b => b.onclick = () => bukaServis(b.dataset.sv));
    };
    await muat();
  },
};
