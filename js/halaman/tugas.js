import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, kosong, hariIni, geserHari, animasiAngka } from '../ui.js';

export default {
  async tampil(el) {
    const h = hariIni(), awal = h.slice(0, 8) + '01';
    el.innerHTML = `<section class="grid-stat" id="bonus">${'<div class="stat kerangka"></div>'.repeat(4)}</section>
      <section class="kartu muncul d2"><div class="kartu-kepala"><h3>${ikon('star', 18)} Tugas saya</h3></div><div id="daftar"></div></section>`;
    const muat = async () => {
      const [b] = await aksi('laporan_bonus', { p_dari: awal, p_sampai: h });
      const x = b || { jml_transaksi: 0, penjualan: 0, jml_servis: 0, bonus_total: 0 };
      $('#bonus', el).innerHTML = `
        <div class="stat emas muncul"><small>${ikon('money', 14)} Bonus bulan ini</small><b data-hitung="${x.bonus_total}" data-rp>Rp 0</b><em>sementara, s/d hari ini</em></div>
        <div class="stat muncul d1"><small>${ikon('kasir', 14)} Transaksi saya</small><b data-hitung="${x.jml_transaksi}">0</b></div>
        <div class="stat muncul d2"><small>${ikon('chart', 14)} Penjualan saya</small><b data-hitung="${x.penjualan}" data-rp>Rp 0</b></div>
        <div class="stat biru muncul d3"><small>${ikon('tool', 14)} Servis saya selesai</small><b data-hitung="${x.jml_servis}">0</b></div>`;
      animasiAngka($('#bonus', el));
      const t = await api.ambil('tugas', { eq: { staf_id: sesi.staf.id }, gte: { tanggal: geserHari(h, -14) }, order: 'tanggal.desc' });
      $('#daftar', el).innerHTML = t.length ? t.map((g, i) => `<div class="baris-daftar muncul" style="--i:${i}">
        <span class="bd-ikon ${g.status === 'disetujui' ? 'hijau' : ''}">${ikon(g.status === 'baru' ? 'clock' : 'check', 18)}</span>
        <span class="bd-utama"><b>${esc(g.judul)}</b><small>${tgl(g.tanggal, false)}${g.keterangan ? ' · ' + esc(g.keterangan) : ''}${Number(g.bonus) ? ' · bonus ' + rp(g.bonus) : ''}</small></span>
        ${g.status === 'baru' ? `<button class="btn kecil utama" data-id="${g.id}">${ikon('check', 14)} Selesai</button>` : `<span class="pil ${g.status === 'disetujui' ? 'hijau' : g.status === 'ditolak' ? 'merah' : 'kuning'}">${g.status === 'selesai' ? 'menunggu owner' : g.status}</span>`}</div>`).join('') : kosong('Belum ada tugas', 'star');
      $$('[data-id]', el).forEach(b => b.onclick = async () => { try { await aksi('selesaikan_tugas', { p_id: b.dataset.id }); toast('Tugas ditandai selesai'); muat(); } catch (e) { salah(e); } });
    };
    await muat();
  },
};
