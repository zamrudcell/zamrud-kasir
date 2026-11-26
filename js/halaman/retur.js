import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, kosong, konfirmasi, tanya } from '../ui.js';
import { petaStaf, hapusCache } from '../data.js';
import { bukaTransaksi } from './transaksi.js';

export default {
  async tampil(el, { segarkanNotif }) {
    let status = 'menunggu';
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="segmen" id="st">${[['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['', 'Semua']].map(([v, t], i) => `<button class="${i ? '' : 'aktif'}" data-v="${v}">${t}</button>`).join('')}</div>
        <span class="isi-kanan"></span>
        <button class="btn utama" id="ajukan">${ikon('retur', 18)} Ajukan retur</button>
      </div>
      <div class="info-biru muncul d1">${ikon('shield', 16)} Retur diajukan karyawan dari nota transaksi, lalu <b>owner menyetujui</b>. Stok & uang baru berubah setelah disetujui — tidak bisa dimanipulasi.</div>
      <div class="kartu daftar" id="daftar"></div>`;
    const staf = await petaStaf();
    const muat = async () => {
      const r = await api.ambil('retur', { eq: { status: status || undefined }, order: 'dibuat.desc', limit: 200 });
      const trx = r.length ? await api.ambil('transaksi', { select: 'id,nomor', inn: { id: [...new Set(r.map(x => x.transaksi_id))] } }) : [];
      const tm = Object.fromEntries(trx.map(t => [t.id, t.nomor]));
      const items = r.length ? await api.ambil('retur_item', { inn: { retur_id: r.map(x => x.id) } }) : [];
      const ti = items.length ? await api.ambil('transaksi_item', { select: 'id,nama', inn: { id: items.map(i => i.transaksi_item_id) } }) : [];
      const tim = Object.fromEntries(ti.map(x => [x.id, x.nama]));
      $('#daftar', el).innerHTML = r.length ? r.map((x, i) => `
        <div class="baris-retur-besar muncul" style="--i:${Math.min(i, 12)}">
          <div class="brb-atas"><b>${esc(x.nomor)}</b><button class="tautan" data-trx="${x.transaksi_id}">${esc(tm[x.transaksi_id] || '')}</button>
            <span class="pil ${x.status === 'disetujui' ? 'hijau' : x.status === 'ditolak' ? 'merah' : 'kuning'}">${x.status}</span></div>
          <div class="brb-isi">${items.filter(it => it.retur_id === x.id).map(it => `<span>${esc(tim[it.transaksi_item_id] || '')} x${it.qty}${it.kembali_stok ? '' : ' (rusak)'}</span>`).join(' · ')}</div>
          <div class="brb-bawah"><small>${tgl(x.dibuat)} · oleh ${esc(staf[x.staf_id]?.nama || '-')} · ${x.tindakan === 'tukar_barang' ? 'tukar barang' : 'uang kembali'}<br>Alasan: ${esc(x.alasan)}${x.diputus_oleh ? `<br>Diputus ${esc(staf[x.diputus_oleh]?.nama || '')} ${tgl(x.diputus_waktu)}` : ''}</small>
            <b>${rp(x.total)}</b></div>
          ${x.status === 'menunggu' && sesi.owner ? `<div class="baris-tombol"><button class="btn merah-garis" data-tolak="${x.id}">Tolak</button><button class="btn utama" data-setuju="${x.id}">${ikon('check', 16)} Setujui</button></div>` : ''}
        </div>`).join('') : kosong(status === 'menunggu' ? 'Tidak ada retur yang menunggu' : 'Belum ada retur', 'retur');
      $$('[data-trx]', el).forEach(b => b.onclick = () => bukaTransaksi(b.dataset.trx, muat));
      $$('[data-setuju],[data-tolak]', el).forEach(b => b.onclick = async () => {
        const setuju = !!b.dataset.setuju;
        if (!await konfirmasi(setuju ? 'Setujui retur ini? Stok kembali & uang dikembalikan ke pelanggan.' : 'Tolak retur ini?', { ya: setuju ? 'Setujui' : 'Tolak', bahaya: !setuju })) return;
        try { await aksi('putuskan_retur', { p_id: b.dataset.setuju || b.dataset.tolak, p_setuju: setuju }); hapusCache('produk'); toast(setuju ? 'Retur disetujui' : 'Retur ditolak'); muat(); segarkanNotif?.(); } catch (e) { salah(e); }
      });
    };
    $$('#st button', el).forEach(b => b.onclick = () => { status = b.dataset.v; $$('#st button', el).forEach(x => x.classList.toggle('aktif', x === b)); muat(); });
    $('#ajukan', el).onclick = async () => {
      const no = await tanya('Masukkan nomor nota transaksi (mis. TR261127001):', { judul: 'Cari transaksi', ya: 'Cari' });
      if (!no) return;
      const t = await api.satu('transaksi', { eq: { nomor: no.trim().toUpperCase() } });
      if (!t) return toast('Nota tidak ditemukan', 'err');
      bukaTransaksi(t.id, muat);
    };
    await muat();
  },
};
