import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, lembar, sibuk, kosong, hariIni, geserHari, awalHari, akhirHari, konfirmasi, tanya } from '../ui.js';
import { petaStaf } from '../data.js';
import { notaTransaksi, cetak } from '../nota.js';

export async function bukaTransaksi(id, saatBerubah = () => {}) {
  const [t] = await api.ambil('transaksi', { eq: { id } });
  if (!t) return toast('Transaksi tidak ditemukan', 'err');
  const [items, staf, retur] = await Promise.all([
    api.ambil('transaksi_item', { eq: { transaksi_id: id }, order: 'gratis.asc' }),
    petaStaf(),
    api.ambil('retur', { eq: { transaksi_id: id }, order: 'dibuat.desc' }),
  ]);
  const pel = t.pelanggan_id ? await api.satu('pelanggan', { eq: { id: t.pelanggan_id } }) : null;
  const kasir = staf[t.staf_id]?.nama || '-';
  const l = lembar({ judul: t.nomor, lebar: 560, isi: `
    <div class="ringkas-kepala">
      <span class="pil ${t.status === 'batal' ? 'merah' : 'hijau'}">${t.status === 'batal' ? 'Dibatalkan' : 'Selesai'}</span>
      <span>${tgl(t.dibuat)}</span><span>${ikon('user', 14)} ${esc(kasir)}</span>
      ${pel ? `<span>${ikon('users', 14)} ${esc(pel.nama)} ${esc(pel.hp || '')}</span>` : ''}
    </div>
    ${t.status === 'batal' ? `<div class="info-merah">Dibatalkan oleh ${esc(staf[t.batal_oleh]?.nama || '-')}: ${esc(t.batal_alasan || '')}</div>` : ''}
    <div class="tabel-ringkas">${items.map(i => `<div class="baris">
      <span>${esc(i.nama)} <small>x${i.qty}${i.qty_retur ? ` · retur ${i.qty_retur}` : ''}</small></span><b>${i.gratis ? 'GRATIS' : rp(i.subtotal)}</b></div>`).join('')}</div>
    <div class="tabel-ringkas total">
      <div class="baris"><span>Subtotal</span><span>${rp(t.subtotal)}</span></div>
      ${t.diskon > 0 ? `<div class="baris"><span>Diskon</span><span>-${rp(t.diskon)}</span></div>` : ''}
      <div class="baris besar"><span>Total</span><b>${rp(t.total)}</b></div>
      <div class="baris"><span>Bayar (${esc(t.metode)})</span><span>${rp(t.bayar)}</span></div>
      ${sesi.owner ? `<div class="baris redup"><span>Modal</span><span>${rp(t.modal)}</span></div>` : ''}
    </div>
    ${retur.length ? `<h4 class="sub-judul">${ikon('retur', 16)} Retur</h4>${retur.map(r => `<div class="baris-ringkas"><span>${esc(r.nomor)} · ${esc(r.alasan)}</span><span class="pil ${r.status === 'disetujui' ? 'hijau' : r.status === 'ditolak' ? 'merah' : 'kuning'}">${esc(r.status)} ${rp(r.total)}</span></div>`).join('')}` : ''}
    <div class="baris-tombol bungkus">
      <button class="btn utama" data-cetak>${ikon('print', 18)} Cetak nota</button>
      ${t.status === 'selesai' ? `<button class="btn abu" data-retur>${ikon('retur', 18)} Ajukan retur</button>` : ''}
      ${t.status === 'selesai' && sesi.owner ? `<button class="btn merah-garis" data-batal>${ikon('x', 18)} Batalkan</button>` : ''}
    </div>` });
  $('[data-cetak]', l.el).onclick = () => cetak(notaTransaksi(t, items, { kasir, pelanggan: pel }), 'Nota ' + t.nomor);
  const br = $('[data-retur]', l.el);
  if (br) br.onclick = () => { l.tutup(); formRetur(t, items, saatBerubah); };
  const bb = $('[data-batal]', l.el);
  if (bb) bb.onclick = async () => {
    const alasan = await tanya('Alasan pembatalan (stok akan dikembalikan):', { judul: 'Batalkan transaksi', ya: 'Batalkan' });
    if (!alasan) return;
    try { await aksi('batal_transaksi', { p_id: t.id, p_alasan: alasan }); toast('Transaksi dibatalkan'); l.tutup(); saatBerubah(); } catch (e) { salah(e); }
  };
}

function formRetur(t, items, saatBerubah) {
  const bisa = items.filter(i => i.qty - i.qty_retur > 0);
  const l = lembar({ judul: 'Retur — ' + t.nomor, lebar: 520, isi: `
    <p class="redup">Pilih barang yang dikembalikan pelanggan. Retur akan <b>menunggu persetujuan owner</b> sebelum stok & uang berubah.</p>
    ${bisa.map(i => `<div class="baris-retur" data-id="${i.id}">
      <label class="cek"><input type="checkbox"> <span>${esc(i.nama)}<small>${i.gratis ? 'gratis' : rp(Math.round(i.subtotal / i.qty)) + '/pcs'} · maks ${i.qty - i.qty_retur}</small></span></label>
      <input class="input mini" type="number" min="1" max="${i.qty - i.qty_retur}" value="1">
      <label class="cek kecil"><input type="checkbox" checked data-stok> masuk stok</label>
    </div>`).join('') || kosong('Semua barang sudah diretur')}
    <label class="lbl">Alasan retur</label><input class="input" id="alasan" placeholder="mis. barang rusak / salah tipe">
    <div class="segmen" id="tindakan"><button class="aktif" data-v="uang_kembali">Uang kembali</button><button data-v="tukar_barang">Tukar barang</button></div>
    <button class="btn utama besar penuh" id="kirim">${ikon('retur', 18)} Ajukan retur</button>` });
  let tindakan = 'uang_kembali';
  $$('#tindakan button', l.el).forEach(b => b.onclick = () => { tindakan = b.dataset.v; $$('#tindakan button', l.el).forEach(x => x.classList.toggle('aktif', x === b)); });
  $('#kirim', l.el).onclick = (e) => sibuk(e.currentTarget, async () => {
    const pilih = $$('.baris-retur', l.el).filter(r => $('input[type=checkbox]', r).checked).map(r => ({
      transaksi_item_id: r.dataset.id, qty: Number($('input[type=number]', r).value), kembali_stok: $('[data-stok]', r).checked,
    }));
    if (!pilih.length) return toast('Pilih minimal 1 barang', 'err');
    try {
      const h = await aksi('ajukan_retur', { p_transaksi: t.id, p_items: pilih, p_alasan: $('#alasan', l.el).value.trim(), p_tindakan: tindakan });
      toast(`Retur ${h.nomor} diajukan (${rp(h.total)}) — menunggu owner`); l.tutup(); saatBerubah();
    } catch (er) { salah(er); }
  });
}

export default {
  async tampil(el, { params }) {
    const h = hariIni();
    let dari = h, sampai = h, staf = sesi.owner ? '' : sesi.staf.id, q = '';
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="segmen" id="periode">
          <button class="aktif" data-p="0">Hari ini</button><button data-p="6">7 hari</button><button data-p="29">30 hari</button>
        </div>
        <input type="date" class="input mini-tgl" id="dari" value="${h}"><input type="date" class="input mini-tgl" id="sampai" value="${h}">
        ${sesi.owner ? '<select class="input" id="f-staf"><option value="">Semua kasir</option></select>' : ''}
        <div class="kolom-cari">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari nomor nota…"></div>
      </div>
      <div class="ringkas-angka" id="ringkas"></div>
      <div class="kartu daftar" id="daftar"></div>`;
    const peta = await petaStaf();
    if (sesi.owner) {
      $('#f-staf', el).innerHTML += Object.values(peta).map(s => `<option value="${s.id}">${esc(s.kode)} — ${esc(s.nama)}</option>`).join('');
      $('#f-staf', el).onchange = (e) => { staf = e.target.value; muat(); };
    }
    $$('#periode button', el).forEach(b => b.onclick = () => {
      $$('#periode button', el).forEach(x => x.classList.toggle('aktif', x === b));
      dari = geserHari(h, -Number(b.dataset.p)); sampai = h; $('#dari', el).value = dari; $('#sampai', el).value = sampai; muat();
    });
    $('#dari', el).onchange = (e) => { dari = e.target.value; muat(); };
    $('#sampai', el).onchange = (e) => { sampai = e.target.value; muat(); };
    let tunda; $('#q', el).oninput = (e) => { clearTimeout(tunda); tunda = setTimeout(() => { q = e.target.value.trim(); muat(); }, 300); };

    async function muat() {
      $('#daftar', el).innerHTML = '<div class="memuat"><span></span><span></span><span></span></div>';
      const data = await api.ambil('transaksi', {
        eq: { staf_id: staf || undefined }, gte: { dibuat: awalHari(dari) }, lte: { dibuat: akhirHari(sampai) },
        ilike: q ? { nomor: '*' + q + '*' } : undefined, order: 'dibuat.desc', limit: 500,
      });
      const ok = data.filter(t => t.status === 'selesai');
      $('#ringkas', el).innerHTML = `
        <div><small>Transaksi</small><b>${ok.length}</b></div>
        <div><small>Penjualan</small><b>${rp(ok.reduce((a, t) => a + Number(t.total), 0))}</b></div>
        ${sesi.owner ? `<div><small>Laba kotor</small><b>${rp(ok.reduce((a, t) => a + Number(t.total) - Number(t.modal), 0))}</b></div>` : ''}
        <div><small>Dibatalkan</small><b>${data.length - ok.length}</b></div>`;
      $('#daftar', el).innerHTML = data.length ? data.map((t, i) => `
        <button class="baris-daftar muncul" style="--i:${Math.min(i, 15)}" data-id="${t.id}">
          <span class="bd-ikon ${t.status === 'batal' ? 'merah' : ''}">${ikon(t.status === 'batal' ? 'x' : 'kasir', 18)}</span>
          <span class="bd-utama"><b>${esc(t.nomor)}</b><small>${tgl(t.dibuat)} · ${esc(peta[t.staf_id]?.nama || '-')} · ${esc(t.metode)}</small></span>
          <b class="${t.status === 'batal' ? 'coret' : ''}">${rp(t.total)}</b>
        </button>`).join('') : kosong('Tidak ada transaksi di periode ini', 'list');
      $$('.baris-daftar', el).forEach(b => b.onclick = () => bukaTransaksi(b.dataset.id, muat));
    }
    await muat();
    if (params.get('buka')) bukaTransaksi(params.get('buka'), muat);
  },
};
