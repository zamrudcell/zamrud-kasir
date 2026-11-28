import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, $, $$, toast, salah, lembar, sibuk, kosong, hariIni } from '../ui.js';
import { dataProduk, dataKategori, hapusCache } from '../data.js';
import { notaTransaksi, cetak } from '../nota.js';
import { mulaiPindai } from '../barcode.js';

let keranjang = []; // {produk, qty}
let promo = [];
let member = null; // {kode, hp, nama} — hanya setelah kode member + no WA dicek cocok di server
// harga member hanya untuk member terverifikasi (perhitungan final tetap di server)
const hargaOf = (pr) => member && Number(pr.harga_member) > 0 && Number(pr.harga_member) < Number(pr.harga_jual) ? Number(pr.harga_member) : Number(pr.harga_jual);

function promoBerlaku(p) {
  const h = hariIni();
  return p.aktif && (!p.mulai || p.mulai <= h) && (!p.selesai || p.selesai >= h);
}

// pratinjau promo (perhitungan final tetap di server)
function hitung() {
  let sub = 0, dsk = 0, hemat = 0; const gratis = [];
  for (const k of keranjang) {
    const pr = k.produk, q = k.qty;
    const hj = hargaOf(pr); hemat += (Number(pr.harga_jual) - hj) * q;
    sub += hj * q;
    let terbaik = 0;
    for (const p of promo) {
      if (!['diskon_persen', 'diskon_nominal'].includes(p.jenis)) continue;
      const cocok = (p.syarat === 'produk' && p.syarat_produk_id === pr.id) || (p.syarat === 'kategori' && p.syarat_kategori_id === pr.kategori_id);
      if (!cocok || q < p.min_qty) continue;
      const per = p.jenis === 'diskon_persen' ? hj * p.nilai / 100 : Number(p.nilai);
      terbaik = Math.max(terbaik, Math.min(hj, Math.round(per)));
    }
    k.diskon = terbaik * q; dsk += k.diskon;
  }
  for (const p of promo) {
    if (p.jenis !== 'gratis' || p.syarat === 'servis') continue;
    let ok = false;
    if (p.syarat === 'produk') ok = keranjang.filter(k => k.produk.id === p.syarat_produk_id).reduce((a, k) => a + k.qty, 0) >= p.min_qty;
    if (p.syarat === 'kategori') ok = keranjang.filter(k => k.produk.kategori_id === p.syarat_kategori_id).reduce((a, k) => a + k.qty, 0) >= p.min_qty;
    if (p.syarat === 'min_belanja') ok = sub - dsk >= Number(p.min_belanja);
    if (ok) gratis.push(p);
  }
  return { sub, dsk, hemat, total: Math.max(0, sub - dsk), gratis };
}

export default {
  lepas() { },
  async tampil(el) {
    el.innerHTML = `<div class="kasir">
      <section class="kasir-kiri">
        <div class="cari-baris">
          <div class="kolom-cari">${ikon('search', 18)}<input id="cari" class="input" placeholder="Cari nama / kode / scan barcode…" autocomplete="off"></div>
          <button class="btn-ikon besar" id="btn-scan" title="Scan kamera">${ikon('scan', 22)}</button>
        </div>
        <div class="chips" id="chips"></div>
        <div class="grid-produk" id="grid"></div>
      </section>
      <aside class="kasir-kanan" id="panel-keranjang"></aside>
      <button class="bar-keranjang" id="bar-keranjang" hidden></button>
    </div>`;

    const [produk, kategori, pr] = await Promise.all([dataProduk(), dataKategori(), api.ambil('promo', { eq: { aktif: 'true' } })]);
    promo = pr.filter(promoBerlaku);
    let kat = '', q = '';

    $('#chips', el).innerHTML = `<button class="chip aktif" data-k="">Semua</button>` + kategori.map(k => `<button class="chip" data-k="${k.id}">${esc(k.nama)}</button>`).join('');
    $$('#chips .chip', el).forEach(c => c.onclick = () => { kat = c.dataset.k; $$('#chips .chip', el).forEach(x => x.classList.toggle('aktif', x === c)); gambarGrid(); });

    const gambarGrid = () => {
      const t = q.toLowerCase();
      const daftar = produk.filter(p => (!kat || p.kategori_id === kat) && (!t || p.nama.toLowerCase().includes(t) || (p.kode || '').toLowerCase().includes(t) || (p.barcode || '').includes(t)));
      $('#grid', el).innerHTML = daftar.length ? daftar.slice(0, 120).map((p, i) => `
        <button class="kartu-produk muncul" style="--i:${Math.min(i, 12)}" data-id="${p.id}" ${p.stok <= 0 ? 'disabled' : ''}>
          <span class="kp-kode">${esc(p.kode)}</span>
          <b class="kp-nama">${esc(p.nama)}</b>
          <span class="kp-harga">${rp(p.harga_jual)}</span>${Number(p.harga_member) > 0 ? `<small class="kp-member">Member ${rp(p.harga_member)}</small>` : ''}
          <span class="kp-stok ${p.stok <= 0 ? 'merah' : p.stok <= (p.stok_minimum ?? sesi.pengaturan?.stok_minimum_default ?? 3) ? 'kuning' : ''}">${p.stok <= 0 ? 'Habis' : 'Stok ' + p.stok}</span>
          ${promo.some(x => x.syarat_produk_id === p.id || (x.syarat === 'kategori' && x.syarat_kategori_id === p.kategori_id)) ? `<span class="kp-promo">${ikon('gift', 12)} Promo</span>` : ''}
        </button>`).join('') : kosong(produk.length ? 'Produk tidak ditemukan' : 'Belum ada produk. Owner bisa menambah di menu Produk.');
      $$('#grid .kartu-produk', el).forEach(b => b.onclick = () => { tambah(produk.find(p => p.id === b.dataset.id)); b.classList.remove('denyut'); void b.offsetWidth; b.classList.add('denyut'); });
    };

    const tambah = (p, n = 1) => {
      if (!p) return;
      const ada = keranjang.find(k => k.produk.id === p.id);
      const sekarang = ada ? ada.qty : 0;
      if (sekarang + n > p.stok) return toast(`Stok ${p.nama} tinggal ${p.stok}`, 'err');
      if (ada) ada.qty += n; else keranjang.push({ produk: p, qty: n });
      gambarKeranjang();
    };

    const cari = $('#cari', el);
    cari.oninput = () => { q = cari.value.trim(); gambarGrid(); };
    cari.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const v = cari.value.trim(); if (!v) return;
      const p = produk.find(x => x.barcode === v || (x.kode || '').toUpperCase() === v.toUpperCase());
      if (p) { tambah(p); cari.value = ''; q = ''; gambarGrid(); toast(p.nama + ' ditambahkan'); }
      else toast('Barcode/kode tidak ditemukan', 'err');
    };

    $('#btn-scan', el).onclick = () => bukaPindai((kode) => {
      const p = produk.find(x => x.barcode === kode || (x.kode || '').toUpperCase() === kode.toUpperCase());
      if (p) { tambah(p); toast(p.nama + ' ditambahkan'); if (navigator.vibrate) navigator.vibrate(60); }
      else toast('Tidak dikenal: ' + kode, 'err');
    });

    const panel = $('#panel-keranjang', el), bar = $('#bar-keranjang', el);
    const isiKeranjang = () => {
      const h = hitung();
      return `<div class="keranjang-kepala"><h3>${ikon('kasir', 18)} Keranjang</h3>${keranjang.length ? '<button class="btn-teks merah" data-kosongkan>Kosongkan</button>' : ''}</div>
        <div class="keranjang-isi">${keranjang.length ? keranjang.map((k, i) => `
          <div class="item-keranjang">
            <div class="ik-info"><b>${esc(k.produk.nama)}</b><small>${hargaOf(k.produk) < k.produk.harga_jual ? `<s class="redup">${rp(k.produk.harga_jual)}</s> <span class="emas">${rp(hargaOf(k.produk))} member</span>` : rp(k.produk.harga_jual)}${k.diskon ? ` · <span class="hijau">hemat ${rp(k.diskon)}</span>` : ''}</small></div>
            <div class="stepper"><button data-kurang="${i}">${ikon('minus', 16)}</button><span>${k.qty}</span><button data-tambah="${i}">${ikon('plus', 16)}</button></div>
            <b class="ik-sub">${rp(hargaOf(k.produk) * k.qty - (k.diskon || 0))}</b>
          </div>`).join('') : kosong('Belum ada barang', 'kasir')}
          ${h.gratis.map(g => `<div class="item-gratis">${ikon('gift', 16)} ${esc(g.nama)} — bonus otomatis</div>`).join('')}
        </div>
        <div class="keranjang-total">
          ${member ? `<div class="baris-member">${ikon('star', 16)}<span><b>${esc(member.nama)}</b> · ${esc(member.kode)}<small>${h.hemat ? `Harga member, hemat ${rp(h.hemat)}` : 'Member terverifikasi'}</small></span><button class="btn-teks merah" data-lepas-member>Lepas</button></div>`
            : (keranjang.length ? `<button class="btn abu penuh" data-member>${ikon('star', 16)} Member? Cek kode & no WA</button>` : '')}
          <div class="baris"><span>Subtotal</span><span>${rp(h.sub)}</span></div>
          ${h.dsk ? `<div class="baris hijau"><span>Promo</span><span>-${rp(h.dsk)}</span></div>` : ''}
          <div class="baris total"><span>Total</span><b>${rp(h.total)}</b></div>
          <button class="btn utama besar penuh" data-bayar ${keranjang.length ? '' : 'disabled'}>${ikon('wallet', 18)} Bayar</button>
        </div>`;
    };
    const pasangAksi = (wadah) => {
      $$('[data-tambah]', wadah).forEach(b => b.onclick = () => tambah(keranjang[b.dataset.tambah].produk));
      $$('[data-kurang]', wadah).forEach(b => b.onclick = () => { const k = keranjang[b.dataset.kurang]; k.qty--; if (k.qty <= 0) keranjang.splice(b.dataset.kurang, 1); gambarKeranjang(); });
      const ks = $('[data-kosongkan]', wadah); if (ks) ks.onclick = () => { keranjang = []; gambarKeranjang(); };
      const by = $('[data-bayar]', wadah); if (by) by.onclick = () => bukaBayar();
      const bm = $('[data-member]', wadah); if (bm) bm.onclick = () => cekMember();
      const lm = $('[data-lepas-member]', wadah); if (lm) lm.onclick = () => { member = null; gambarKeranjang(); };
    };
    let lembarKeranjang = null;
    function gambarKeranjang() {
      panel.innerHTML = isiKeranjang(); pasangAksi(panel);
      if (lembarKeranjang && lembarKeranjang.el.isConnected) { lembarKeranjang.el.innerHTML = isiKeranjang(); pasangAksi(lembarKeranjang.el); }
      const n = keranjang.reduce((a, k) => a + k.qty, 0), h = hitung();
      bar.hidden = !n;
      bar.innerHTML = `<span class="bk-jml">${n}</span><span>${n} barang</span><b>${rp(h.total)}</b><span class="bk-aksi">Lihat ${ikon('chevron', 16)}</span>`;
      bar.classList.remove('denyut'); void bar.offsetWidth; bar.classList.add('denyut');
    }
    bar.onclick = () => { lembarKeranjang = lembar({ judul: 'Keranjang', isi: isiKeranjang() }); pasangAksi(lembarKeranjang.el); };

    // verifikasi member: kode member + nomor WA harus cocok di server
    function cekMember() {
      const l = lembar({ judul: 'Cek member', lebar: 420, isi: `<form id="fm">
        <p class="redup kecil">Harga member hanya berlaku bila <b>kode member</b> dan <b>nomor WA</b> sama dengan data di toko. Setiap pengecekan tercatat.</p>
        <label class="lbl">Kode member<input class="input mono" name="kode" placeholder="ZM-0001" autocapitalize="characters" required></label>
        <label class="lbl">Nomor WA member<input class="input" name="hp" inputmode="tel" placeholder="08…" required></label>
        <button class="btn utama besar penuh" type="submit">${ikon('check', 18)} Cek</button></form>` });
      const f = $('#fm', l.el); setTimeout(() => f.kode.focus(), 300);
      f.onsubmit = (e) => { e.preventDefault(); sibuk($('[type=submit]', f), async () => {
        try {
          const r = await aksi('cek_member', { p_kode: f.kode.value.trim(), p_hp: f.hp.value.trim() });
          if (!r?.ok) return toast('Kode member dan nomor WA tidak cocok — tetap harga biasa', 'err');
          member = { kode: r.kode, hp: f.hp.value.trim(), nama: r.nama };
          toast('Member ' + r.nama + ' — harga member dipakai'); l.tutup(); gambarKeranjang();
        } catch (er) { salah(er); }
      }); };
    }

    function bukaBayar() {
      lembarKeranjang?.tutup();
      const h = hitung();
      const l = lembar({ judul: 'Pembayaran', lebar: 460, isi: `
        <div class="total-besar"><small>Total belanja</small><b id="b-total">${rp(h.total)}</b></div>
        <div class="segmen" id="metode">${['tunai', 'transfer', 'qris'].map((m, i) => `<button class="${i ? '' : 'aktif'}" data-m="${m}">${m.toUpperCase()}</button>`).join('')}</div>
        <div id="kotak-tunai">
          <label class="lbl">Uang diterima</label>
          <input class="input besar" id="uang" inputmode="numeric" placeholder="0">
          <div class="cepat">${[['Uang pas', h.total], ['20rb', 20000], ['50rb', 50000], ['100rb', 100000]].map(([t, v]) => `<button class="chip" data-v="${v}">${t}</button>`).join('')}</div>
          <div class="kembali">Kembalian: <b id="kembali">Rp 0</b></div>
        </div>
        ${sesi.owner ? `<label class="lbl">Diskon tambahan (khusus owner)</label><input class="input" id="diskon" inputmode="numeric" placeholder="0">` : ''}
        <details class="lipat"><summary>${ikon('user', 16)} Data pelanggan (opsional)</summary>
          <input class="input" id="p-nama" placeholder="Nama pelanggan"><input class="input" id="p-hp" inputmode="tel" placeholder="No HP / WA">
        </details>
        <button class="btn utama besar penuh" id="btn-selesai">${ikon('check', 18)} Selesaikan transaksi</button>
        <p class="redup kecil tengah">Transaksi tercatat atas nama <b>${esc(sesi.staf.nama)}</b></p>` });
      let metode = 'tunai';
      const uang = $('#uang', l.el), kembali = $('#kembali', l.el), dk = $('#diskon', l.el);
      const angkaDari = (v) => Number(String(v || '').replace(/\D/g, '')) || 0;
      const totalAkhir = () => Math.max(0, h.total - (dk ? angkaDari(dk.value) : 0));
      const segar = () => {
        $('#b-total', l.el).textContent = rp(totalAkhir());
        const k = angkaDari(uang.value) - totalAkhir();
        kembali.textContent = k >= 0 ? rp(k) : 'kurang ' + rp(-k);
        kembali.className = k >= 0 ? '' : 'merah';
      };
      uang.oninput = () => { const n = angkaDari(uang.value); uang.value = n ? n.toLocaleString('id-ID') : ''; segar(); };
      if (dk) dk.oninput = () => { const n = angkaDari(dk.value); dk.value = n ? n.toLocaleString('id-ID') : ''; segar(); };
      $$('.cepat .chip', l.el).forEach(c => c.onclick = () => { uang.value = Number(c.dataset.v === String(h.total) ? totalAkhir() : c.dataset.v).toLocaleString('id-ID'); segar(); });
      $$('#metode button', l.el).forEach(b => b.onclick = () => {
        metode = b.dataset.m; $$('#metode button', l.el).forEach(x => x.classList.toggle('aktif', x === b));
        $('#kotak-tunai', l.el).hidden = metode !== 'tunai';
      });
      setTimeout(() => uang.focus(), 350);
      $('#btn-selesai', l.el).onclick = (e) => sibuk(e.currentTarget, async () => {
        try {
          const hasil = await aksi('buat_transaksi', {
            p_items: keranjang.map(k => ({ produk_id: k.produk.id, qty: k.qty })),
            p_bayar: metode === 'tunai' ? angkaDari(uang.value) : totalAkhir(),
            p_metode: metode,
            p_pelanggan_nama: $('#p-nama', l.el).value.trim() || null,
            p_pelanggan_hp: $('#p-hp', l.el).value.trim() || null,
            p_diskon: dk ? angkaDari(dk.value) : 0,
            p_catatan: '',
            p_member_kode: member?.kode || null,
            p_member_hp: member?.hp || null,
          });
          l.tutup();
          keranjang = []; member = null; hapusCache('produk');
          await selesai(hasil.id);
          // muat ulang daftar produk (stok terbaru)
          const baru = await dataProduk(); produk.splice(0, produk.length, ...baru);
          gambarGrid(); gambarKeranjang();
        } catch (er) { salah(er); }
      });
    }

    async function selesai(id) {
      const [t] = await api.ambil('transaksi', { eq: { id } });
      const items = await api.ambil('transaksi_item', { eq: { transaksi_id: id }, order: 'gratis.asc' });
      const pel = t.pelanggan_id ? await api.satu('pelanggan', { eq: { id: t.pelanggan_id } }) : null;
      const l = lembar({ judul: 'Transaksi berhasil', lebar: 420, isi: `
        <div class="sukses"><div class="centang-anim">${ikon('check', 44)}</div>
          <h3>${esc(t.nomor)}</h3><p>Total <b>${rp(t.total)}</b>${t.kembali > 0 ? ` · Kembali <b>${rp(t.kembali)}</b>` : ''}</p>
          ${t.member_id && pel?.kode_member ? `<p class="emas">${ikon('star', 14)} Harga member · ${esc(pel.nama)} (${esc(pel.kode_member)})</p>` : ''}</div>
        <div class="baris-tombol"><button class="btn abu" data-x>Transaksi baru</button><button class="btn utama" data-cetak>${ikon('print', 18)} Cetak nota</button></div>` });
      $('[data-x]', l.el).onclick = () => l.tutup();
      $('[data-cetak]', l.el).onclick = () => cetak(notaTransaksi(t, items, { kasir: sesi.staf.nama, pelanggan: pel }), 'Nota ' + t.nomor);
    }

    gambarGrid(); gambarKeranjang();
    if (matchMedia('(min-width: 900px)').matches) cari.focus();
  },
};

// lembar pemindai kamera (dipakai juga oleh halaman lain)
export function bukaPindai(saatDapat, { sekali = false } = {}) {
  const l = lembar({ judul: 'Scan barcode', lebar: 480, isi: `
    <div class="pindai"><video playsinline muted></video><div class="garis-pindai"></div></div>
    <p class="redup kecil tengah" id="st-pindai">Arahkan kamera ke barcode…</p>
    <input class="input" id="manual" placeholder="atau ketik kode lalu Enter" inputmode="numeric">` });
  let berhenti = () => {};
  mulaiPindai($('video', l.el), (k) => { saatDapat(k); if (sekali) l.tutup(); })
    .then(f => { berhenti = f; })
    .catch(e => { $('#st-pindai', l.el).textContent = 'Kamera tidak bisa dibuka: ' + e.message + '. Ketik kode manual.'; });
  const m = $('#manual', l.el);
  m.onkeydown = (e) => { if (e.key === 'Enter' && m.value.trim()) { saatDapat(m.value.trim()); m.value = ''; if (sekali) l.tutup(); } };
  l.janji.then(() => berhenti());
  return l;
}
