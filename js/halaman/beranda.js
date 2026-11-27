import { api } from '../api.js';
import { grafikArus } from '../grafik.js';
import { sesi } from '../sesi.js';
import { esc, ikon, rp, tgl, geserHari, hariIni, awalHari, akhirHari, animasiAngka, PERAN, STATUS_SERVIS, $ } from '../ui.js';

function salam() {
  const j = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Makassar' }));
  return j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 18 ? 'Selamat sore' : 'Selamat malam';
}

export default {
  async tampil(el) {
    const s = sesi.staf, h = hariIni();
    el.innerHTML = `
      <section class="hero muncul">
        <div class="hero-teks">
          <small>${salam()},</small>
          <h2>${esc(s.nama)}</h2>
          <span class="pil-emas">${ikon('shield', 14)} ${esc(PERAN[s.peran])} · ${esc(s.kode)}</span>
        </div>
        <img src="assets/gem.png?v=2" class="hero-gem" alt="">
        <div class="hero-jam" id="jam"></div>
      </section>
      <section class="grid-stat" id="stat">${'<div class="stat kerangka"></div>'.repeat(4)}</section>
      <section class="aksi-cepat muncul d2">
        ${sesi.bisaJual ? `<a href="#/kasir" class="aksi">${ikon('kasir', 26)}<span>Transaksi</span></a>` : ''}
        <a href="#/servis?baru=1" class="aksi">${ikon('tool', 26)}<span>Servis Baru</span></a>
        <a href="#/produk" class="aksi">${ikon('search', 26)}<span>Cek Stok</span></a>
        <a href="#/opname" class="aksi">${ikon('clip', 26)}<span>Opname</span></a>
      </section>
      <div class="dua-kolom">
        <section class="kartu muncul d3"><div class="kartu-kepala"><h3><a href="#/transaksi">${ikon('list', 18)} Transaksi terakhir</a></h3><a href="#/transaksi" class="tautan">Semua ${ikon('chevron', 14)}</a></div><div id="trx-akhir"></div></section>
        <section class="kartu muncul d4"><div class="kartu-kepala"><h3><a href="#/produk?menipis=1">${ikon('alert', 18)} Stok hampir habis</a></h3><a href="#/produk?menipis=1" class="tautan">Lihat ${ikon('chevron', 14)}</a></div><div id="stok-tipis"></div></section>
      </div>
      ${sesi.owner ? `<section class="kartu muncul d4 kartu-arus" id="arus-mini"></section>` : ''}
      <section class="kartu muncul d5" id="kotak-tugas" hidden></section>`;
    if (sesi.owner) grafikArus($('#arus-mini', el), geserHari(h, -6), h, { judul: `<a href="#/laporan">${ikon('chart', 18)} 7 hari terakhir</a>`, kecil: true }).catch(() => { $('#arus-mini', el)?.remove(); });

    const jam = $('#jam', el);
    const putarJam = () => { if (!jam.isConnected) return clearInterval(t); jam.textContent = new Date().toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }); };
    const t = setInterval(putarJam, 15000); putarJam();

    const filterStaf = sesi.owner ? {} : { staf_id: s.id };
    const [trx, servis, tipis, tugas, retur] = await Promise.all([
      api.ambil('transaksi', { select: 'id,nomor,total,modal,staf_id,dibuat,status', eq: { status: 'selesai', ...filterStaf }, gte: { dibuat: awalHari(h) }, lte: { dibuat: akhirHari(h) }, order: 'dibuat.desc' }),
      api.ambil('servis', { select: 'id,status', inn: { status: ['antri', 'dikerjakan', 'tunggu_sparepart', 'siap_diambil'] } }),
      api.ambil('v_stok_menipis', { select: 'id,nama,stok,batas', order: 'stok.asc', limit: 6 }),
      sesi.owner ? [] : api.ambil('tugas', { eq: { staf_id: s.id, tanggal: h } , order: 'dibuat.asc' }),
      sesi.owner ? api.ambil('retur', { select: 'id', eq: { status: 'menunggu' } }) : [],
    ]);
    const omzet = trx.reduce((a, x) => a + Number(x.total), 0);
    const laba = trx.reduce((a, x) => a + Number(x.total) - Number(x.modal), 0);
    const aktif = servis.filter(x => x.status !== 'siap_diambil').length;
    const siap = servis.filter(x => x.status === 'siap_diambil').length;
    $('#stat', el).innerHTML = `
      <a href="#/${sesi.owner ? 'laporan' : 'tugas'}" class="stat emas muncul"><small>${ikon('money', 14)} ${sesi.owner ? 'Penjualan hari ini' : 'Penjualan saya hari ini'}</small><b data-hitung="${omzet}" data-rp>Rp 0</b><em>${sesi.owner ? `Laba kotor ${rp(laba)}` : 'lihat bonus saya'}</em></a>
      <a href="#/transaksi" class="stat muncul d1"><small>${ikon('list', 14)} Transaksi</small><b data-hitung="${trx.length}">0</b><em>hari ini · lihat riwayat</em></a>
      <a href="#/servis" class="stat biru muncul d2"><small>${ikon('tool', 14)} Servis aktif</small><b data-hitung="${aktif}">0</b><em>antri & dikerjakan</em></a>
      <a href="#/servis" class="stat hijau muncul d3"><small>${ikon('check', 14)} Siap diambil</small><b data-hitung="${siap}">0</b><em>${sesi.owner && retur.length ? retur.length + ' retur menunggu' : 'hubungi pelanggan'}</em></a>`;
    animasiAngka($('#stat', el));

    $('#trx-akhir', el).innerHTML = trx.length ? `<div class="daftar-ringkas">${trx.slice(0, 6).map(x => `
      <a class="baris-ringkas" href="#/transaksi?buka=${x.id}"><span><b>${esc(x.nomor)}</b><small>${tgl(x.dibuat)}</small></span><b>${rp(x.total)}</b></a>`).join('')}</div>`
      : `<p class="redup">Belum ada transaksi hari ini.</p>`;
    $('#stok-tipis', el).innerHTML = tipis.length ? `<div class="daftar-ringkas">${tipis.map(x => `
      <div class="baris-ringkas"><span>${esc(x.nama)}</span><b class="${x.stok <= 0 ? 'merah' : 'kuning'}">${x.stok <= 0 ? 'HABIS' : 'sisa ' + x.stok}</b></div>`).join('')}</div>`
      : `<p class="redup">Semua stok aman 👍</p>`;

    if (!sesi.owner) {
      const k = $('#kotak-tugas', el); k.hidden = false;
      k.innerHTML = `<div class="kartu-kepala"><h3><a href="#/tugas">${ikon('star', 18)} Tugas saya hari ini</a></h3><a href="#/tugas" class="tautan">Semua ${ikon('chevron', 14)}</a></div>
        ${tugas.length ? tugas.map(g => `<div class="baris-ringkas"><span>${esc(g.judul)}</span><span class="pil ${g.status === 'baru' ? 'abu' : g.status === 'disetujui' ? 'hijau' : 'kuning'}">${esc(g.status)}</span></div>`).join('') : '<p class="redup">Tidak ada tugas khusus hari ini.</p>'}`;
    }
  },
};
