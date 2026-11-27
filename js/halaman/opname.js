import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, lembar, sibuk, kosong, konfirmasi, angka, hitungNaik } from '../ui.js';
import { dataKategori, petaStaf, hapusCache, ambilModal } from '../data.js';
import { bukaPindai } from './kasir.js';

export default {
  async tampil(el) {
    const [kategori, staf] = await Promise.all([dataKategori(), petaStaf()]);
    const kmap = Object.fromEntries(kategori.map(k => [k.id, k.nama]));
    let opname = (await api.ambil('opname', { eq: { status: 'draf' }, order: 'dibuat.desc', limit: 1 }))[0];

    const riwayat = async () => {
      const r = await api.ambil('opname', { order: 'dibuat.desc', limit: 30 });
      const l = lembar({ judul: 'Riwayat opname', lebar: 560, isi: r.length ? `<div class="daftar-ringkas">${r.map(o => `
        <button class="baris-ringkas" data-id="${o.id}"><span><b>${esc(o.keterangan || 'Opname')}</b><small>${tgl(o.dibuat)} · ${esc(staf[o.staf_id]?.nama || '')}</small></span>
        <span class="pil ${o.status === 'final' ? 'hijau' : o.status === 'batal' ? 'merah' : 'kuning'}">${o.status}</span></button>`).join('')}</div>` : kosong('Belum ada opname') });
      $$('[data-id]', l.el).forEach(b => b.onclick = async () => {
        const o = r.find(x => x.id === b.dataset.id);
        const it = await api.ambil('opname_item', { eq: { opname_id: o.id }, order: 'produk_id.asc', semua: true });
        const md = await ambilModal('opname_item', [o.id]).catch(() => ({})); it.forEach(i => { i.harga_beli = md[i.produk_id] || 0; });
        const prod = await api.ambil('produk', { select: 'id,nama,kode', order: 'id.asc', semua: true });
        const pm = Object.fromEntries(prod.map(p => [p.id, p]));
        const beda = it.filter(i => i.stok_fisik !== null && i.stok_fisik !== i.stok_sistem);
        lembar({ judul: o.keterangan || 'Opname', lebar: 560, isi: `
          <div class="ringkas-angka"><div><small>Terisi</small><b>${it.filter(i => i.stok_fisik !== null).length}/${it.length}</b></div>
          <div><small>Selisih</small><b>${beda.length} produk</b></div>
          ${sesi.owner ? `<div><small>Nilai selisih</small><b>${rp(beda.reduce((a, i) => a + (i.stok_fisik - i.stok_sistem) * i.harga_beli, 0))}</b></div>` : ''}</div>
          <div class="daftar-ringkas">${beda.map(i => `<div class="baris-ringkas"><span>${esc(pm[i.produk_id]?.nama || '-')}<small class="blok">sistem ${i.stok_sistem} → fisik ${i.stok_fisik}</small></span><b class="${i.stok_fisik > i.stok_sistem ? 'hijau' : 'merah'}">${i.stok_fisik > i.stok_sistem ? '+' : ''}${i.stok_fisik - i.stok_sistem}</b></div>`).join('') || '<p class="redup">Tidak ada selisih — stok cocok semua 👍</p>'}</div>` });
      });
    };

    if (!opname) {
      el.innerHTML = `<section class="kartu-gelap muncul">
          <h2>${ikon('clip', 24)} Stok Opname</h2>
          <p>Cocokkan barang fisik di toko/gudang dengan data di aplikasi. Sistem mencatat stok saat ini, lalu karyawan mengisi jumlah fisik.</p>
          <label class="lbl">Keterangan opname</label>
          <input class="input gelap" id="ket" placeholder="Contoh: Opname Gudang ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}">
          <label class="lbl">Kategori (opsional)</label>
          <select class="input gelap" id="kat"><option value="">Semua kategori</option>${kategori.map(k => `<option value="${k.id}">${esc(k.nama)}</option>`).join('')}</select>
          <div class="baris-tombol"><button class="btn gelap" id="riwayat">${ikon('history', 18)} Riwayat Opname</button><button class="btn utama emas" id="mulai">${ikon('plus', 18)} Mulai opname</button></div>
        </section>`;
      $('#riwayat', el).onclick = riwayat;
      $('#mulai', el).onclick = (e) => sibuk(e.currentTarget, async () => {
        try { await aksi('buat_opname', { p_keterangan: $('#ket', el).value.trim(), p_kategori: $('#kat', el).value || null }); this.tampil(el); } catch (er) { salah(er); }
      });
      return;
    }

    let item = await api.ambil('opname_item', { eq: { opname_id: opname.id }, order: 'produk_id.asc', semua: true });
    const modalOp = await ambilModal('opname_item', [opname.id]).catch(() => ({})); item.forEach(i => { i.harga_beli = modalOp[i.produk_id] || 0; });
    const produk = await api.ambil('produk', { select: 'id,nama,kode,barcode,kategori_id', order: 'id.asc', semua: true });
    const pm = Object.fromEntries(produk.map(p => [p.id, p]));
    item.sort((a, b) => (pm[a.produk_id]?.nama || '').localeCompare(pm[b.produk_id]?.nama || ''));
    let kat = '', q = '', hanyaBelum = false;

    el.innerHTML = `
      <section class="kartu-gelap ringkas-opname muncul">
        <div class="ro-atas"><div class="ro-progres"><span id="teks-progres"></span><div class="bar"><i id="bar"></i></div></div>
          <div class="ro-kotak biru"><b id="n-terisi">0</b><small>Terisi</small></div></div>
        <div class="ro-grid">
          <div class="ro-kotak"><b class="hijau" id="n-lebih">0</b><small>Lebih</small></div>
          <div class="ro-kotak"><b class="merah" id="n-kurang">0</b><small>Kurang</small></div>
          ${sesi.owner ? `<div class="ro-kotak lebar"><b class="emas" id="n-aset">Rp 0</b><small>Nilai Aset</small></div>
          <div class="ro-kotak"><b class="ungu" id="n-selisih">Rp 0</b><small>Nilai Selisih (±)</small></div>` : ''}
        </div>
      </section>
      <section class="kartu muncul d2">
        <div class="lbl-kecil">KETERANGAN OPNAME</div>
        <div class="ket-opname"><b>${esc(opname.keterangan || 'Opname')}</b><small>dimulai ${tgl(opname.dibuat)} oleh ${esc(staf[opname.staf_id]?.nama || '')}</small></div>
        <div class="baris-tombol kiri bungkus">
          <button class="btn gelap" id="riwayat">${ikon('history', 18)} Riwayat Opname</button>
          ${sesi.owner ? `<button class="btn utama" id="final">${ikon('check', 18)} Finalisasi & sesuaikan stok</button><button class="btn merah-garis" id="batal">${ikon('x', 18)} Batalkan</button>` : '<span class="redup kecil">Finalisasi dilakukan oleh owner.</span>'}
        </div>
        <div class="filter-bar">
          <span class="lbl-filter">${ikon('filter', 16)} Filter:</span>
          <select class="input" id="kat"><option value="">— Semua Kategori —</option>${kategori.map(k => `<option value="${k.id}">${esc(k.nama)}</option>`).join('')}</select>
          <div class="kolom-cari">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari nama / kode produk…"></div>
          <button class="btn-ikon besar" id="scan">${ikon('scan', 20)}</button>
          <label class="cek"><input type="checkbox" id="belum"> Belum diisi</label>
        </div>
        <div class="tabel-wadah"><table class="tabel" id="tabel"><thead><tr><th>Produk</th><th>Kategori</th>${sesi.owner ? '<th class="kanan">Harga beli</th>' : ''}<th class="kanan">Stok sistem</th><th class="tengah">Stok fisik</th><th class="kanan">Selisih</th></tr></thead><tbody></tbody></table></div>
      </section>`;

    const ringkas = () => {
      const terisi = item.filter(i => i.stok_fisik !== null);
      const lebih = terisi.filter(i => i.stok_fisik > i.stok_sistem), kurang = terisi.filter(i => i.stok_fisik < i.stok_sistem);
      const pct = item.length ? Math.round(terisi.length / item.length * 100) : 0;
      $('#teks-progres', el).textContent = `Progress: ${terisi.length} / ${item.length} produk terisi (${pct}%)`;
      $('#bar', el).style.width = pct + '%';
      $('#n-terisi', el).textContent = terisi.length;
      $('#n-lebih', el).textContent = lebih.length; $('#n-kurang', el).textContent = kurang.length;
      if (sesi.owner) $('#n-aset', el).textContent = rp(item.reduce((a, i) => a + Math.max(0, i.stok_sistem) * i.harga_beli, 0));
      if (sesi.owner) $('#n-selisih', el).textContent = rp(terisi.reduce((a, i) => a + (i.stok_fisik - i.stok_sistem) * i.harga_beli, 0));
    };
    const baris = (i) => {
      const p = pm[i.produk_id] || {}; const s = i.stok_fisik === null ? null : i.stok_fisik - i.stok_sistem;
      return `<tr data-id="${i.produk_id}" class="${s === null ? '' : s === 0 ? 'cocok' : 'beda'}">
        <td><b>${esc(p.nama)}</b><small class="blok">${esc(p.kode)} | ${esc(p.barcode || '-')}</small></td>
        <td><span class="pil biru-muda">${esc(kmap[p.kategori_id] || '—')}</span></td>
        ${sesi.owner ? `<td class="kanan mono">${rp(i.harga_beli)}</td>` : ''}
        <td class="kanan"><b>${i.stok_sistem}</b></td>
        <td class="tengah"><input class="input mini fisik" inputmode="numeric" value="${i.stok_fisik ?? ''}" placeholder="—"></td>
        <td class="kanan selisih">${s === null ? '<span class="redup">—</span>' : `<b class="${s > 0 ? 'hijau' : s < 0 ? 'merah' : ''}">${s > 0 ? '+' : ''}${s}</b>`}</td></tr>`;
    };
    const gambar = () => {
      const t = q.toLowerCase();
      const d = item.filter(i => { const p = pm[i.produk_id] || {}; return (!kat || p.kategori_id === kat) && (!hanyaBelum || i.stok_fisik === null) && (!t || (p.nama || '').toLowerCase().includes(t) || (p.kode || '').toLowerCase().includes(t) || (p.barcode || '').includes(t)); });
      $('#tabel tbody', el).innerHTML = d.length ? d.map(baris).join('') : `<tr><td colspan="6">${kosong('Tidak ada produk')}</td></tr>`;
      pasang();
    };
    const simpan = async (produkId, nilai, tr) => {
      const it = item.find(i => i.produk_id === produkId);
      const v = nilai === '' ? null : Number(nilai);
      if (v !== null && (isNaN(v) || v < 0)) return toast('Angka tidak valid', 'err');
      try {
        await aksi('isi_opname', { p_opname: opname.id, p_produk: produkId, p_fisik: v });
        it.stok_fisik = v;
        const baru = document.createElement('tbody'); baru.innerHTML = baris(it);
        tr.replaceWith(baru.firstElementChild); pasang(); ringkas();
        const t2 = $(`tr[data-id="${produkId}"]`, el); t2?.classList.add('kilat');
      } catch (e) { salah(e); }
    };
    function pasang() {
      $$('#tabel tbody tr[data-id]', el).forEach(tr => {
        const inp = $('.fisik', tr); if (!inp || inp.dataset.p) return; inp.dataset.p = 1;
        inp.onchange = () => simpan(tr.dataset.id, inp.value.trim(), tr);
        inp.onkeydown = (e) => { if (e.key === 'Enter') { inp.blur(); const n = tr.nextElementSibling?.querySelector('.fisik'); n?.focus(); } };
      });
    }
    $('#kat', el).onchange = (e) => { kat = e.target.value; gambar(); };
    $('#q', el).oninput = (e) => { q = e.target.value.trim(); gambar(); };
    $('#belum', el).onchange = (e) => { hanyaBelum = e.target.checked; gambar(); };
    $('#riwayat', el).onclick = riwayat;
    $('#scan', el).onclick = () => bukaPindai((k) => {
      const p = produk.find(x => x.barcode === k || x.kode === k);
      if (!p) return toast('Tidak ada di opname ini: ' + k, 'err');
      const it = item.find(i => i.produk_id === p.id);
      const n = prompt(`${p.nama}\nStok sistem: ${it.stok_sistem}\nJumlah fisik?`, it.stok_fisik ?? '');
      if (n !== null) { const tr = $(`tr[data-id="${p.id}"]`, el); if (tr) simpan(p.id, n.trim(), tr); else { q = ''; gambar(); } }
    });
    const bf = $('#final', el); if (bf) bf.onclick = async () => {
      const belum = item.filter(i => i.stok_fisik === null).length;
      if (!await konfirmasi(`Finalisasi opname? Stok produk yang berbeda akan disesuaikan dengan stok fisik.${belum ? `\n\n${belum} produk belum diisi dan tidak akan diubah.` : ''}`, { ya: 'Finalisasi' })) return;
      try { const n = await aksi('final_opname', { p_opname: opname.id }); hapusCache('produk'); toast(`Opname final — ${n} produk disesuaikan`); this.tampil(el); } catch (e) { salah(e); }
    };
    const bt = $('#batal', el); if (bt) bt.onclick = async () => {
      if (!await konfirmasi('Batalkan opname ini? Stok tidak berubah.', { bahaya: true, ya: 'Batalkan' })) return;
      try { await aksi('batal_opname', { p_opname: opname.id }); this.tampil(el); } catch (e) { salah(e); }
    };
    ringkas(); gambar();
  },
};
