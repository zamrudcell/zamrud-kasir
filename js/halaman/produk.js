import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, lembar, sibuk, kosong, angka } from '../ui.js';
import { dataProduk, dataKategori, hapusCache } from '../data.js';
import { barcodeSVG } from '../barcode.js';
import { cetak } from '../nota.js';
import { bukaPindai } from './kasir.js';

const batasMin = (p) => p.stok_minimum ?? sesi.pengaturan?.stok_minimum_default ?? 3;

export function cetakLabel(daftar) {
  // daftar: [{produk, jumlah}]
  const label = daftar.flatMap(({ produk: p, jumlah }) => Array.from({ length: jumlah }, () => `
    <div class="label-bc"><div class="lb-toko">ZAMRUD CELL</div><div class="lb-nama">${esc(p.nama)}</div>
      <div class="lb-harga">${rp(p.harga_jual)}</div>${barcodeSVG(p.barcode || p.kode, { tinggi: 34, modul: 1.4 })}</div>`)).join('');
  cetak(`<section class="lembar-label">${label}</section>`, 'Label barcode');
}

function formProduk(p, kategori, saatSimpan) {
  const baru = !p || !p.id; p = { satuan: 'pcs', aktif: true, ...(p || {}) };
  const l = lembar({ judul: baru ? 'Produk baru' : 'Ubah produk', lebar: 560, isi: `
    <form id="fp" class="form-grid">
      <label class="lbl s2">Nama produk<input class="input" name="nama" required value="${esc(p.nama || '')}"></label>
      <label class="lbl">Kode<input class="input" name="kode" value="${esc(p.kode || '')}" placeholder="otomatis"></label>
      <label class="lbl">Barcode<div class="gabung"><input class="input" name="barcode" value="${esc(p.barcode || '')}" placeholder="otomatis / scan"><button type="button" class="btn-ikon" data-scan>${ikon('scan', 18)}</button></div></label>
      <label class="lbl">Kategori<select class="input" name="kategori_id"><option value="">— tanpa kategori —</option>${kategori.map(k => `<option value="${k.id}" ${k.id === p.kategori_id ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
      <label class="lbl">Satuan<input class="input" name="satuan" value="${esc(p.satuan || 'pcs')}"></label>
      <label class="lbl">Harga beli (modal)<input class="input" name="harga_beli" inputmode="numeric" required value="${p.harga_beli ?? ''}"></label>
      <label class="lbl">Harga jual<input class="input" name="harga_jual" inputmode="numeric" required value="${p.harga_jual ?? ''}"></label>
      ${baru ? '<label class="lbl">Stok awal<input class="input" name="stok" inputmode="numeric" value="0"></label>' : ''}
      <label class="lbl">Stok minimum<input class="input" name="stok_minimum" inputmode="numeric" placeholder="default ${sesi.pengaturan?.stok_minimum_default ?? 3}" value="${p.stok_minimum ?? ''}"></label>
      <label class="lbl">Garansi (hari)<input class="input" name="garansi_hari" inputmode="numeric" placeholder="default ${sesi.pengaturan?.garansi_jual_hari ?? 7}" value="${p.garansi_hari ?? ''}"></label>
      <label class="cek s2"><input type="checkbox" name="aktif" ${p.aktif ? 'checked' : ''}> Produk aktif (tampil di kasir)</label>
      <div class="info-untung s2" id="untung"></div>
      <button class="btn utama besar s2" type="submit">${ikon('check', 18)} Simpan</button>
    </form>` });
  const f = $('#fp', l.el);
  const untung = () => { const b = Number(f.harga_beli.value) || 0, j = Number(f.harga_jual.value) || 0; $('#untung', l.el).innerHTML = j ? `Untung per pcs: <b>${rp(j - b)}</b> (${b ? Math.round((j - b) / b * 100) : 0}%)` : ''; };
  f.harga_beli.oninput = f.harga_jual.oninput = untung; untung();
  $('[data-scan]', l.el).onclick = () => bukaPindai(k => { f.barcode.value = k; }, { sekali: true });
  f.onsubmit = (e) => {
    e.preventDefault();
    sibuk($('[type=submit]', f), async () => {
      try {
        const d = Object.fromEntries(new FormData(f));
        d.aktif = f.aktif.checked; if (!baru) d.id = p.id;
        for (const k of ['harga_beli', 'harga_jual', 'stok']) if (d[k] !== undefined) d[k] = Number(String(d[k]).replace(/\D/g, '')) || 0;
        await aksi('simpan_produk', { p_data: d });
        hapusCache('produk'); hapusCache('produkS');
        toast('Produk disimpan'); l.tutup(); saatSimpan();
      } catch (er) { salah(er); }
    });
  };
}

async function detailProduk(p, kategori, saatBerubah) {
  const [mutasi, harga] = await Promise.all([
    api.ambil('stok_mutasi', { eq: { produk_id: p.id }, order: 'dibuat.desc', limit: 30 }),
    sesi.owner ? api.ambil('harga_log', { eq: { produk_id: p.id }, order: 'dibuat.desc', limit: 10 }) : [],
  ]);
  const kat = kategori.find(k => k.id === p.kategori_id);
  const l = lembar({ judul: p.nama, lebar: 560, isi: `
    <div class="produk-detail">
      <div class="pd-barcode">${barcodeSVG(p.barcode || p.kode, { tinggi: 60, modul: 2 })}</div>
      <div class="grid-info">
        <div><small>Kode</small><b>${esc(p.kode)}</b></div>
        <div><small>Kategori</small><b>${esc(kat?.nama || '-')}</b></div>
        <div><small>Harga jual</small><b>${rp(p.harga_jual)}</b></div>
        ${sesi.owner ? `<div><small>Harga beli</small><b>${rp(p.harga_beli)}</b></div>` : ''}
        <div><small>Stok</small><b class="${p.stok <= batasMin(p) ? 'merah' : ''}">${angka(p.stok)} ${esc(p.satuan)}</b></div>
        <div><small>Garansi</small><b>${p.garansi_hari ?? sesi.pengaturan?.garansi_jual_hari ?? 7} hari</b></div>
      </div>
      <div class="baris-tombol bungkus">
        <button class="btn abu" data-label>${ikon('barcode', 18)} Cetak label</button>
        ${sesi.owner ? `<button class="btn abu" data-masuk>${ikon('plus', 18)} Stok masuk</button><button class="btn utama" data-ubah>${ikon('edit', 18)} Ubah</button>` : ''}
      </div>
      <h4 class="sub-judul">${ikon('history', 16)} Riwayat stok</h4>
      <div class="daftar-ringkas">${mutasi.map(m => `<div class="baris-ringkas"><span>${esc(m.jenis)} <small>${esc(m.ref || '')} · ${tgl(m.dibuat)}</small></span><b class="${m.qty < 0 ? 'merah' : 'hijau'}">${m.qty > 0 ? '+' : ''}${m.qty} → ${m.stok_akhir}</b></div>`).join('') || '<p class="redup">Belum ada mutasi</p>'}</div>
      ${harga.length ? `<h4 class="sub-judul">${ikon('tag', 16)} Riwayat harga</h4><div class="daftar-ringkas">${harga.map(h => `<div class="baris-ringkas"><span><small>${tgl(h.dibuat)}</small></span><span>jual ${rp(h.jual_lama)} → <b>${rp(h.jual_baru)}</b></span></div>`).join('')}</div>` : ''}
    </div>` });
  $('[data-label]', l.el).onclick = async () => {
    const n = Number(prompt('Jumlah label yang dicetak?', '1')) || 0;
    if (n > 0) cetakLabel([{ produk: p, jumlah: Math.min(n, 200) }]);
  };
  const bu = $('[data-ubah]', l.el); if (bu) bu.onclick = () => { l.tutup(); formProduk(p, kategori, saatBerubah); };
  const bm = $('[data-masuk]', l.el); if (bm) bm.onclick = () => {
    l.tutup();
    const m = lembar({ judul: 'Stok masuk — ' + p.nama, lebar: 420, isi: `
      <label class="lbl">Jumlah masuk</label><input class="input besar" id="qty" inputmode="numeric" placeholder="0">
      <label class="lbl">Harga beli baru (opsional)</label><input class="input" id="hb" inputmode="numeric" placeholder="${p.harga_beli}">
      <label class="lbl">Keterangan</label><input class="input" id="ket" placeholder="mis. beli dari supplier X">
      <button class="btn utama besar penuh" id="ok">${ikon('check', 18)} Simpan</button>` });
    $('#ok', m.el).onclick = (e) => sibuk(e.currentTarget, async () => {
      try {
        await aksi('stok_masuk', { p_produk: p.id, p_qty: Number($('#qty', m.el).value), p_harga_beli: Number($('#hb', m.el).value) || null, p_ket: $('#ket', m.el).value || 'barang masuk' });
        hapusCache('produk'); hapusCache('produkS'); toast('Stok ditambahkan'); m.tutup(); saatBerubah();
      } catch (er) { salah(er); }
    });
  };
}

export default {
  async tampil(el, { params }) {
    let kat = '', q = '', menipis = params.get('menipis') === '1', nonaktif = false;
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="kolom-cari">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari nama / kode / barcode…"></div>
        <button class="btn-ikon besar" id="scan" title="Scan">${ikon('scan', 20)}</button>
        <select class="input" id="kat"><option value="">Semua kategori</option></select>
        <label class="cek"><input type="checkbox" id="tipis" ${menipis ? 'checked' : ''}> Stok menipis</label>
        ${sesi.owner ? '<label class="cek"><input type="checkbox" id="nonaktif"> Tampilkan nonaktif</label>' : ''}
        <span class="isi-kanan"></span>
        <button class="btn abu" id="label">${ikon('barcode', 18)} Label</button>
        ${sesi.owner ? `<button class="btn abu" id="b-kat">${ikon('tag', 18)} Kategori</button><button class="btn utama" id="baru">${ikon('plus', 18)} Produk</button>` : ''}
      </div>
      <div class="ringkas-angka" id="ringkas"></div>
      <div class="kartu tabel-wadah"><table class="tabel" id="tabel"><thead><tr>
        <th>Produk</th><th>Kategori</th>${sesi.owner ? '<th class="kanan">Harga beli</th>' : ''}<th class="kanan">Harga jual</th><th class="kanan">Stok</th></tr></thead><tbody></tbody></table></div>`;
    let produk = [], kategori = [];
    const muat = async () => {
      [produk, kategori] = await Promise.all([dataProduk(sesi.owner), dataKategori()]);
      const sel = $('#kat', el); const v = sel.value;
      sel.innerHTML = '<option value="">Semua kategori</option>' + kategori.map(k => `<option value="${k.id}">${esc(k.nama)}</option>`).join(''); sel.value = v;
      gambar();
    };
    const gambar = () => {
      const t = q.toLowerCase();
      const d = produk.filter(p => (nonaktif || p.aktif) && (!kat || p.kategori_id === kat) && (!menipis || p.stok <= batasMin(p))
        && (!t || p.nama.toLowerCase().includes(t) || (p.kode || '').toLowerCase().includes(t) || (p.barcode || '').includes(t)));
      const aktif = produk.filter(p => p.aktif);
      $('#ringkas', el).innerHTML = `<div><small>Produk aktif</small><b>${aktif.length}</b></div>
        <div><small>Total stok</small><b>${angka(aktif.reduce((a, p) => a + p.stok, 0))}</b></div>
        ${sesi.owner ? `<div><small>Nilai aset (modal)</small><b>${rp(aktif.reduce((a, p) => a + Math.max(0, p.stok) * p.harga_beli, 0))}</b></div>` : ''}
        <div><small>Stok menipis</small><b class="kuning">${aktif.filter(p => p.stok <= batasMin(p)).length}</b></div>`;
      const kmap = Object.fromEntries(kategori.map(k => [k.id, k.nama]));
      $('#tabel tbody', el).innerHTML = d.length ? d.map((p, i) => `<tr class="muncul ${p.aktif ? '' : 'redup'}" style="--i:${Math.min(i, 15)}" data-id="${p.id}">
        <td><b>${esc(p.nama)}</b><small class="blok">${esc(p.kode)} · ${esc(p.barcode || '-')}</small></td>
        <td><span class="pil abu">${esc(kmap[p.kategori_id] || '—')}</span></td>
        ${sesi.owner ? `<td class="kanan">${rp(p.harga_beli)}</td>` : ''}
        <td class="kanan"><b>${rp(p.harga_jual)}</b></td>
        <td class="kanan"><span class="pil ${p.stok <= 0 ? 'merah' : p.stok <= batasMin(p) ? 'kuning' : 'hijau'}">${angka(p.stok)}</span></td></tr>`).join('')
        : `<tr><td colspan="5">${kosong(produk.length ? 'Tidak ada yang cocok' : 'Belum ada produk')}</td></tr>`;
      $$('#tabel tbody tr[data-id]', el).forEach(r => r.onclick = () => detailProduk(produk.find(p => p.id === r.dataset.id), kategori, muat));
    };
    $('#q', el).oninput = (e) => { q = e.target.value.trim(); gambar(); };
    $('#kat', el).onchange = (e) => { kat = e.target.value; gambar(); };
    $('#tipis', el).onchange = (e) => { menipis = e.target.checked; gambar(); };
    const na = $('#nonaktif', el); if (na) na.onchange = (e) => { nonaktif = e.target.checked; gambar(); };
    $('#scan', el).onclick = () => bukaPindai(k => {
      const p = produk.find(x => x.barcode === k || x.kode === k);
      if (p) detailProduk(p, kategori, muat); else { toast('Belum terdaftar: ' + k, 'err'); if (sesi.owner) formProduk({ barcode: k }, kategori, muat); }
    }, { sekali: true });
    $('#label', el).onclick = () => {
      const tampil = produk.filter(p => p.aktif);
      const l = lembar({ judul: 'Cetak label barcode', lebar: 560, isi: `
        <p class="redup">Isi jumlah label per produk, lalu cetak (kertas stiker A4 / printer label).</p>
        <div class="daftar-label">${tampil.map(p => `<div class="baris-ringkas"><span>${esc(p.nama)}<small class="blok">${esc(p.barcode || p.kode)}</small></span><input class="input mini" type="number" min="0" value="0" data-id="${p.id}"></div>`).join('') || kosong('Belum ada produk')}</div>
        <button class="btn utama besar penuh" id="ok">${ikon('print', 18)} Cetak</button>` });
      $('#ok', l.el).onclick = () => {
        const d = $$('input[data-id]', l.el).map(i => ({ produk: tampil.find(p => p.id === i.dataset.id), jumlah: Math.min(200, Number(i.value) || 0) })).filter(x => x.jumlah > 0);
        if (!d.length) return toast('Isi jumlah label dulu', 'err');
        cetakLabel(d);
      };
    };
    const bb = $('#baru', el); if (bb) bb.onclick = () => formProduk(null, kategori, muat);
    const bk = $('#b-kat', el); if (bk) bk.onclick = () => kelolaKategori(kategori, muat);
    await muat();
  },
};

function kelolaKategori(kategori, saatBerubah) {
  const l = lembar({ judul: 'Kategori', lebar: 440, isi: `
    <div class="daftar-ringkas" id="dk">${kategori.map(k => `<div class="baris-ringkas"><span>${esc(k.nama)}</span><button class="btn-ikon" data-id="${k.id}">${ikon('edit', 16)}</button></div>`).join('') || '<p class="redup">Belum ada kategori</p>'}</div>
    <div class="gabung"><input class="input" id="nama" placeholder="Kategori baru (mis. Aksesoris, Sparepart LCD)"><button class="btn utama" id="tambah">${ikon('plus', 18)}</button></div>` });
  const simpan = async (id, nama) => {
    try { await aksi('simpan_kategori', { p_id: id, p_nama: nama }); hapusCache('kategori'); toast('Kategori disimpan'); l.tutup(); saatBerubah(); } catch (e) { salah(e); }
  };
  $('#tambah', l.el).onclick = () => { const n = $('#nama', l.el).value.trim(); if (n) simpan(null, n); };
  $$('[data-id]', l.el).forEach(b => b.onclick = () => { const k = kategori.find(x => x.id === b.dataset.id); const n = prompt('Nama kategori', k.nama); if (n && n.trim()) simpan(k.id, n.trim()); });
}
