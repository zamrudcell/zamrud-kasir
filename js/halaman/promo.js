import { api } from '../api.js';
import { aksi } from '../sesi.js';
import { esc, ikon, rp, $, $$, toast, salah, lembar, sibuk, kosong, konfirmasi, hariIni } from '../ui.js';
import { dataProduk, dataKategori, hapusCache } from '../data.js';

function uraian(p, pm, km) {
  const syarat = p.syarat === 'produk' ? `beli ${p.min_qty}+ ${pm[p.syarat_produk_id]?.nama || '?'}`
    : p.syarat === 'kategori' ? `beli ${p.min_qty}+ kategori ${km[p.syarat_kategori_id]?.nama || '?'}`
    : p.syarat === 'min_belanja' ? `belanja min ${rp(p.min_belanja)}` : `servis "${p.syarat_kata_servis}"`;
  const hasil = p.jenis === 'diskon_persen' ? `diskon ${Number(p.nilai)}%/pcs` : p.jenis === 'diskon_nominal' ? `potongan ${rp(p.nilai)}/pcs`
    : `gratis ${p.hadiah_qty}x ${pm[p.hadiah_produk_id]?.nama || '?'}`;
  return `${syarat} → ${hasil}`;
}

function formPromo(p, produk, kategori, saatSimpan) {
  p = p || { jenis: 'gratis', syarat: 'produk', min_qty: 1, hadiah_qty: 1, aktif: true };
  const opsiProduk = (pilih) => produk.map(x => `<option value="${x.id}" ${x.id === pilih ? 'selected' : ''}>${esc(x.nama)} (${rp(x.harga_jual)})</option>`).join('');
  const l = lembar({ judul: p.id ? 'Ubah promo' : 'Promo baru', lebar: 560, isi: `
    <form id="fp" class="form-grid">
      <label class="lbl s2">Nama promo<input class="input" name="nama" required value="${esc(p.nama || '')}" placeholder="mis. Ganti LCD gratis tempered glass"></label>
      <label class="lbl">Syarat<select class="input" name="syarat">
        <option value="produk">Beli produk tertentu</option><option value="kategori">Beli dari kategori</option>
        <option value="min_belanja">Minimal belanja</option><option value="servis">Servis jenis tertentu</option></select></label>
      <label class="lbl">Hasil<select class="input" name="jenis">
        <option value="gratis">Dapat barang gratis</option><option value="diskon_persen">Diskon %</option><option value="diskon_nominal">Potongan Rp</option></select></label>
      <label class="lbl s2" data-s="produk">Produk syarat<select class="input" name="syarat_produk_id"><option value="">— pilih —</option>${opsiProduk(p.syarat_produk_id)}</select></label>
      <label class="lbl s2" data-s="kategori">Kategori syarat<select class="input" name="syarat_kategori_id"><option value="">— pilih —</option>${kategori.map(k => `<option value="${k.id}" ${k.id === p.syarat_kategori_id ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
      <label class="lbl s2" data-s="servis">Kata kunci jenis servis<input class="input" name="syarat_kata_servis" value="${esc(p.syarat_kata_servis || '')}" placeholder="mis. LCD (berlaku untuk servis 'Ganti LCD')"></label>
      <label class="lbl" data-s="produk kategori">Minimal jumlah beli<input class="input" name="min_qty" inputmode="numeric" value="${p.min_qty}"></label>
      <label class="lbl" data-s="min_belanja">Minimal belanja (Rp)<input class="input" name="min_belanja" inputmode="numeric" value="${Number(p.min_belanja) || ''}"></label>
      <label class="lbl" data-j="diskon_persen diskon_nominal">Nilai (% atau Rp per pcs)<input class="input" name="nilai" inputmode="decimal" value="${Number(p.nilai) || ''}"></label>
      <label class="lbl s2" data-j="gratis">Barang gratis<select class="input" name="hadiah_produk_id"><option value="">— pilih —</option>${opsiProduk(p.hadiah_produk_id)}</select></label>
      <label class="lbl" data-j="gratis">Jumlah gratis<input class="input" name="hadiah_qty" inputmode="numeric" value="${p.hadiah_qty}"></label>
      <label class="lbl">Mulai<input class="input" type="date" name="mulai" value="${p.mulai || ''}"></label>
      <label class="lbl">Selesai<input class="input" type="date" name="selesai" value="${p.selesai || ''}"></label>
      <label class="cek s2"><input type="checkbox" name="aktif" ${p.aktif ? 'checked' : ''}> Promo aktif</label>
      <p class="redup kecil s2">Promo dihitung otomatis oleh sistem saat transaksi/pengambilan servis — kasir tidak bisa mengubahnya.</p>
      <button class="btn utama besar s2" type="submit">${ikon('check', 18)} Simpan promo</button>
    </form>` });
  const f = $('#fp', l.el);
  f.syarat.value = p.syarat; f.jenis.value = p.jenis;
  const atur = () => {
    if (f.syarat.value === 'servis' && f.jenis.value !== 'gratis') f.jenis.value = 'gratis';
    if (f.syarat.value === 'min_belanja' && f.jenis.value !== 'gratis') f.jenis.value = 'gratis';
    $$('[data-s]', f).forEach(x => x.hidden = !x.dataset.s.split(' ').includes(f.syarat.value));
    $$('[data-j]', f).forEach(x => x.hidden = !x.dataset.j.split(' ').includes(f.jenis.value));
    [...f.jenis.options].forEach(o => o.disabled = ['servis', 'min_belanja'].includes(f.syarat.value) && o.value !== 'gratis');
  };
  f.syarat.onchange = f.jenis.onchange = atur; atur();
  f.onsubmit = (e) => {
    e.preventDefault();
    sibuk($('[type=submit]', f), async () => {
      try {
        const d = Object.fromEntries(new FormData(f)); d.aktif = f.aktif.checked; if (p.id) d.id = p.id;
        d.min_belanja = String(d.min_belanja || '').replace(/\D/g, '');
        await aksi('simpan_promo', { p_data: d }); toast('Promo disimpan'); l.tutup(); saatSimpan();
      } catch (er) { salah(er); }
    });
  };
}

export default {
  async tampil(el) {
    el.innerHTML = `
      <section class="kartu muncul">
        <div class="kartu-kepala"><h3>${ikon('tag', 18)} Naikkan / turunkan harga</h3></div>
        <p class="redup">Ubah harga jual banyak produk sekaligus. Hanya owner. Semua perubahan tercatat di riwayat harga.</p>
        <div class="form-grid empat">
          <label class="lbl">Kategori<select class="input" id="h-kat"><option value="">Semua produk</option></select></label>
          <label class="lbl">Cara<select class="input" id="h-mode"><option value="persen">Persen (%)</option><option value="nominal">Nominal (Rp)</option></select></label>
          <label class="lbl">Nilai (+ naik / − turun)<input class="input" id="h-nilai" inputmode="decimal" placeholder="mis. 10 atau -5"></label>
          <label class="lbl">Bulatkan ke<select class="input" id="h-bulat"><option value="500">Rp 500</option><option value="1000">Rp 1.000</option><option value="100">Rp 100</option><option value="0">Tidak</option></select></label>
        </div>
        <button class="btn utama" id="h-ok">${ikon('check', 18)} Terapkan</button>
      </section>
      <section class="kartu muncul d2">
        <div class="kartu-kepala"><h3>${ikon('gift', 18)} Promo & barang gratis</h3><button class="btn utama" id="baru">${ikon('plus', 18)} Promo</button></div>
        <div id="daftar"></div>
      </section>`;
    let [produk, kategori] = await Promise.all([dataProduk(), dataKategori()]);
    $('#h-kat', el).innerHTML += kategori.map(k => `<option value="${k.id}">${esc(k.nama)}</option>`).join('');
    $('#h-ok', el).onclick = (e) => sibuk(e.currentTarget, async () => {
      const nilai = Number(String($('#h-nilai', el).value).replace(',', '.'));
      if (!nilai) return toast('Isi nilai perubahan', 'err');
      const mode = $('#h-mode', el).value, kat = $('#h-kat', el).value;
      const kena = produk.filter(p => !kat || p.kategori_id === kat).length;
      if (!await konfirmasi(`${nilai > 0 ? 'Naikkan' : 'Turunkan'} harga ${kena} produk sebesar ${mode === 'persen' ? Math.abs(nilai) + '%' : rp(Math.abs(nilai))}?`, { ya: 'Terapkan' })) return;
      try {
        const n = await aksi('ubah_harga_massal', { p_kategori: kat || null, p_mode: mode, p_nilai: nilai, p_bulat: Number($('#h-bulat', el).value) });
        hapusCache('produk'); hapusCache('produkS'); produk = await dataProduk(); toast(`${n} harga produk diubah`);
      } catch (er) { salah(er); }
    });
    const muat = async () => {
      const d = await api.ambil('promo', { order: 'dibuat.desc' });
      const pm = Object.fromEntries(produk.map(p => [p.id, p])), km = Object.fromEntries(kategori.map(k => [k.id, k]));
      const h = hariIni();
      $('#daftar', el).innerHTML = d.length ? d.map((p, i) => {
        const jalan = p.aktif && (!p.mulai || p.mulai <= h) && (!p.selesai || p.selesai >= h);
        return `<button class="baris-promo muncul ${jalan ? '' : 'redup'}" style="--i:${i}" data-id="${p.id}">
          <span class="bp-ikon">${ikon(p.jenis === 'gratis' ? 'gift' : 'tag', 20)}</span>
          <span class="bd-utama"><b>${esc(p.nama)}</b><small>${esc(uraian(p, pm, km))}${p.mulai || p.selesai ? ` · ${p.mulai || '…'} s/d ${p.selesai || '…'}` : ''}</small></span>
          <span class="pil ${jalan ? 'hijau' : 'abu'}">${jalan ? 'Berjalan' : p.aktif ? 'Terjadwal' : 'Nonaktif'}</span></button>`;
      }).join('') : kosong('Belum ada promo', 'gift');
      $$('[data-id]', el).forEach(b => b.onclick = () => formPromo(d.find(p => p.id === b.dataset.id), produk, kategori, muat));
    };
    $('#baru', el).onclick = () => formPromo(null, produk, kategori, muat);
    await muat();
  },
};
