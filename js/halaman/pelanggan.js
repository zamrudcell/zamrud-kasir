import { api } from '../api.js';
import { esc, ikon, rp, tgl, $, $$, lembar, kosong, toast, salah, sibuk, konfirmasi, STATUS_SERVIS } from '../ui.js';
import { sesi, aksi } from '../sesi.js';
import { cetak } from '../nota.js';
import { barcodeSVG } from '../barcode.js';

// owner menambah pelanggan member langsung (kode member dibuat otomatis)
function formMember(saatSimpan) {
  const l = lembar({ judul: 'Tambah member baru', lebar: 460, isi: `<form id="fmb" class="grid-form">
    <label class="lbl s2">Nama member<input class="input" name="nama" required placeholder="Nama lengkap"></label>
    <label class="lbl s2">Nomor WA<input class="input" name="hp" inputmode="tel" required placeholder="08…"></label>
    <label class="lbl s2">Alamat <small class="redup">(opsional)</small><input class="input" name="alamat"></label>
    <label class="lbl s2">Catatan <small class="redup">(opsional)</small><input class="input" name="catatan" placeholder="misal: langganan servis sejak 2024"></label>
    <p class="redup kecil s2">Nomor WA ini yang harus cocok dengan kode member saat belanja / servis. Bila nomor sudah pernah tercatat, data pelanggan lamanya yang dijadikan member.</p>
    <button class="btn utama besar s2" type="submit">${ikon('star', 18)} Simpan & buat kode member</button></form>` });
  const f = $('#fmb', l.el); setTimeout(() => f.nama.focus(), 300);
  f.onsubmit = (e) => { e.preventDefault(); sibuk($('[type=submit]', f), async () => {
    try {
      const r = await aksi('tambah_member', { p_nama: f.nama.value.trim(), p_hp: f.hp.value.trim(), p_alamat: f.alamat.value.trim(), p_catatan: f.catatan.value.trim() });
      toast(`${r.nama} jadi member ${r.kode}`); l.tutup();
      const p = await api.satu('pelanggan', { eq: { id: r.id } });
      saatSimpan(p || { id: r.id, nama: r.nama, hp: r.hp, kode_member: r.kode, member_aktif: true, dibuat: new Date().toISOString() });
    } catch (er) { salah(er); }
  }); };
}

// kartu member untuk dicetak / difoto
function cetakKartu(p) {
  cetak(`<section class="kartu-member-cetak"><div class="km-atas"><img src="assets/gem.png" alt=""><div><b>ZAMRUD CELL</b><small>KARTU MEMBER</small></div></div>
    <div class="km-nama">${esc(p.nama)}</div><div class="km-kode">${esc(p.kode_member)}</div>${barcodeSVG(p.kode_member, { tinggi: 38, modul: 1.6 })}
    <div class="km-ket">Sebutkan kode member & nomor WA terdaftar saat belanja / servis untuk mendapat harga member.</div></section>`, 'Kartu member ' + p.kode_member);
}
import { bukaServis } from './servis.js';
import { bukaTransaksi } from './transaksi.js';

async function detail(p, saatBerubah = () => {}) {
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
    <div class="kotak-member ${p.member_aktif ? 'aktif' : ''}">${ikon('star', 18)}
      ${p.member_aktif ? `<span><b>MEMBER · ${esc(p.kode_member)}</b><small>Harga member berlaku bila kode & no WA ${esc(p.hp || '')} cocok</small></span><button class="btn kecil" data-kartu>${ikon('print', 16)} Kartu</button>${sesi.owner ? '<button class="btn kecil merah-garis" data-cabut>Cabut</button>' : ''}`
        : `<span><b>Bukan member</b><small>${sesi.owner ? 'Owner bisa menjadikan pelanggan ini member' : 'Hanya owner yang bisa menjadikan member'}</small></span>${sesi.owner ? '<button class="btn kecil utama" data-jadikan>Jadikan member</button>' : ''}`}
    </div>
    ${p.hp ? `<a class="btn abu" href="https://wa.me/${esc(p.hp.replace(/^0/, '62').replace(/\D/g, ''))}" target="_blank" rel="noopener">${ikon('phone', 16)} Chat WhatsApp</a>` : ''}
    <h4 class="sub-judul">${ikon('phone', 16)} Riwayat servis per HP</h4>
    ${Object.keys(hp).length ? Object.entries(hp).map(([k, d]) => `<div class="kelompok-hp"><div class="kh-kepala">${ikon('phone', 16)} <b>${esc([d[0].merek, d[0].tipe].filter(Boolean).join(' '))}</b> <small class="mono">${esc(k)}</small> <span class="pil abu">${d.length}x</span></div>
      ${d.map(v => `<button class="baris-ringkas" data-sv="${v.id}"><span><b>${esc(v.nomor)}</b><small>${tgl(v.dibuat, false)} · ${esc(v.jenis_servis || v.keluhan)}</small></span><span class="pil ${STATUS_SERVIS[v.status].warna}">${STATUS_SERVIS[v.status].label}</span></button>`).join('')}</div>`).join('') : '<p class="redup">Belum pernah servis</p>'}
    <h4 class="sub-judul">${ikon('kasir', 16)} Riwayat belanja</h4>
    <div class="daftar-ringkas">${trx.map(t => `<button class="baris-ringkas" data-trx="${t.id}"><span><b>${esc(t.nomor)}</b><small>${tgl(t.dibuat)}</small></span><b class="${t.status === 'batal' ? 'coret' : ''}">${rp(t.total)}</b></button>`).join('') || '<p class="redup">Belum ada belanja</p>'}</div>` });
  const atur = async (aktif) => {
    if (!aktif && !await konfirmasi(`Cabut status member ${p.nama}? Harga member tidak berlaku lagi.`, { bahaya: true, ya: 'Cabut' })) return;
    try {
      const kd = await aksi('atur_member', { p_pelanggan: p.id, p_aktif: aktif });
      p.member_aktif = aktif; p.kode_member = kd; toast(aktif ? `${p.nama} jadi member ${kd}` : 'Status member dicabut');
      l.tutup(); saatBerubah(); detail(p, saatBerubah);
    } catch (er) { salah(er); }
  };
  const bj = $('[data-jadikan]', l.el); if (bj) bj.onclick = () => atur(true);
  const bc = $('[data-cabut]', l.el); if (bc) bc.onclick = () => atur(false);
  const bk = $('[data-kartu]', l.el); if (bk) bk.onclick = () => cetakKartu(p);
  $$('[data-sv]', l.el).forEach(b => b.onclick = () => { l.tutup(); bukaServis(b.dataset.sv); });
  $$('[data-trx]', l.el).forEach(b => b.onclick = () => { l.tutup(); bukaTransaksi(b.dataset.trx); });
}

export default {
  async tampil(el) {
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="kolom-cari lebar">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari nama / no HP pelanggan…"></div>
        <div class="kolom-cari">${ikon('phone', 18)}<input class="input mono" id="imei" placeholder="Cek riwayat IMEI…" inputmode="numeric"></div>
        <label class="cek"><input type="checkbox" id="hanya-member"> Hanya member</label>
        ${sesi.owner ? `<button class="btn utama" id="baru-member">${ikon('plus', 18)} Member baru</button>` : ''}
      </div>
      <div id="hasil-imei"></div>
      <div class="kartu daftar" id="daftar"></div>`;
    const muat = async (q = '') => {
      const qq = q.replace(/[(),]/g, ' ');
      const d = await api.ambil('pelanggan', { or: q ? `nama.ilike.*${qq}*,hp.ilike.*${qq}*,kode_member.ilike.*${qq}*` : undefined,
        ...($('#hanya-member', el).checked ? { eq: { member_aktif: 'true' } } : {}), order: 'dibuat.desc', limit: 200 })
        .catch(() => api.ambil('pelanggan', { or: q ? `nama.ilike.*${qq}*,hp.ilike.*${qq}*` : undefined, order: 'dibuat.desc', limit: 200 }));
      $('#daftar', el).innerHTML = d.length ? d.map((p, i) => `<button class="baris-daftar muncul" style="--i:${Math.min(i, 15)}" data-id="${p.id}">
        <span class="avatar kecil">${esc(p.nama[0] || '?')}</span><span class="bd-utama"><b>${esc(p.nama)}</b><small>${esc(p.hp || '-')}</small></span>${p.member_aktif ? `<span class="pil emas">${ikon('star', 12)} ${esc(p.kode_member)}</span>` : ''}${ikon('chevron', 18)}</button>`).join('') : kosong('Belum ada pelanggan', 'users');
      $$('[data-id]', el).forEach(b => b.onclick = () => detail(d.find(p => p.id === b.dataset.id), () => muat($('#q', el).value.trim())));
    };
    const bm = $('#baru-member', el);
    if (bm) bm.onclick = () => formMember((p) => { muat(); detail(p, () => muat()); });
    $('#hanya-member', el).onchange = () => muat($('#q', el).value.trim());
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
