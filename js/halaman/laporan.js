import { api } from '../api.js';
import { aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, lembar, sibuk, kosong, hariIni, geserHari, awalHari, akhirHari, angka, konfirmasi, animasiAngka } from '../ui.js';
import { petaStaf } from '../data.js';

function grafikBatang(data) {
  // data: [{label, nilai}]
  const maks = Math.max(1, ...data.map(d => d.nilai));
  const w = 640, h = 200, bw = w / Math.max(1, data.length);
  return `<svg viewBox="0 0 ${w} ${h + 24}" class="grafik" preserveAspectRatio="none">
    ${data.map((d, i) => { const t = Math.round(d.nilai / maks * h); return `<g><rect class="batang" style="--i:${i}" x="${i * bw + bw * .15}" y="${h - t}" width="${bw * .7}" height="${t}" rx="4"><title>${d.label}: ${rp(d.nilai)}</title></rect>
      ${data.length <= 16 || i % Math.ceil(data.length / 12) === 0 ? `<text x="${i * bw + bw / 2}" y="${h + 16}" text-anchor="middle">${esc(d.label)}</text>` : ''}</g>`; }).join('')}</svg>`;
}

export default {
  async tampil(el) {
    const h = hariIni();
    let dari = h.slice(0, 8) + '01', sampai = h, tab = 'laba';
    el.innerHTML = `
      <div class="filter-bar muncul">
        <div class="segmen" id="cepat"><button data-p="hari">Hari ini</button><button data-p="7">7 hari</button><button class="aktif" data-p="bulan">Bulan ini</button><button data-p="bulanlalu">Bulan lalu</button></div>
        <input type="date" class="input mini-tgl" id="dari" value="${dari}"><input type="date" class="input mini-tgl" id="sampai" value="${sampai}">
      </div>
      <div class="tab-garis" id="tab">${[['laba', 'Laba Rugi'], ['barang', 'Beli & Jual per Barang'], ['pelanggan', 'Profit Pelanggan'], ['pengeluaran', 'Pengeluaran']].map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'aktif' : ''}">${t}</button>`).join('')}</div>
      <div id="isi"></div>`;
    const isi = $('#isi', el);
    $$('#cepat button', el).forEach(b => b.onclick = () => {
      $$('#cepat button', el).forEach(x => x.classList.toggle('aktif', x === b));
      const p = b.dataset.p;
      if (p === 'hari') { dari = sampai = h; }
      else if (p === '7') { dari = geserHari(h, -6); sampai = h; }
      else if (p === 'bulan') { dari = h.slice(0, 8) + '01'; sampai = h; }
      else { const d = new Date(h.slice(0, 8) + '01T00:00:00'); d.setDate(0); sampai = d.toLocaleDateString('en-CA'); dari = sampai.slice(0, 8) + '01'; }
      $('#dari', el).value = dari; $('#sampai', el).value = sampai; muat();
    });
    $('#dari', el).onchange = (e) => { dari = e.target.value; muat(); };
    $('#sampai', el).onchange = (e) => { sampai = e.target.value; muat(); };
    $$('#tab button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; $$('#tab button', el).forEach(x => x.classList.toggle('aktif', x === b)); muat(); });

    async function muat() {
      isi.innerHTML = '<div class="memuat"><span></span><span></span><span></span></div>';
      try {
        if (tab === 'laba') await labaRugi();
        if (tab === 'barang') await perBarang();
        if (tab === 'pelanggan') await perPelanggan();
        if (tab === 'pengeluaran') await pengeluaran();
      } catch (e) { isi.innerHTML = kosong(e.message, 'alert'); }
    }

    async function labaRugi() {
      const r = await aksi('laporan_laba', { p_dari: dari, p_sampai: sampai });
      const n = (k) => Number(r[k]) || 0;
      const pendapatan = n('penjualan') - n('retur') + n('jasa') + n('jual_sparepart');
      const hpp = n('modal_jual') - n('modal_kembali') + n('modal_sparepart');
      const kotor = pendapatan - hpp, bersih = kotor - n('pengeluaran');
      isi.innerHTML = `
        <section class="grid-stat">
          <div class="stat emas muncul"><small>Pendapatan</small><b data-hitung="${pendapatan}" data-rp>0</b><em>${r.jml_transaksi} transaksi · ${r.jml_servis} servis</em></div>
          <div class="stat muncul d1"><small>Laba kotor</small><b data-hitung="${kotor}" data-rp>0</b><em>margin ${pendapatan ? Math.round(kotor / pendapatan * 100) : 0}%</em></div>
          <div class="stat ${bersih >= 0 ? 'hijau' : 'merah'} muncul d2"><small>Laba bersih</small><b data-hitung="${bersih}" data-rp>0</b><em>setelah pengeluaran</em></div>
          <div class="stat merah muncul d3"><small>Piutang servis</small><b data-hitung="${n('belum_lunas')}" data-rp>0</b><em>belum lunas (periode ini)</em></div>
        </section>
        <section class="kartu muncul d2"><div class="kartu-kepala"><h3>${ikon('chart', 18)} Penjualan harian</h3></div>${grafikBatang((r.harian || []).map(x => ({ label: String(x.tgl).slice(8, 10), nilai: Number(x.nilai) })))}</section>
        <section class="kartu muncul d3"><h3>${ikon('list', 18)} Rincian laba rugi</h3>
          <div class="tabel-ringkas laporan">
            <div class="baris"><span>Penjualan barang</span><span>${rp(n('penjualan'))}</span></div>
            <div class="baris"><span>Retur disetujui</span><span class="merah">-${rp(n('retur'))}</span></div>
            <div class="baris"><span>Jasa servis</span><span>${rp(n('jasa'))}</span></div>
            <div class="baris"><span>Sparepart servis</span><span>${rp(n('jual_sparepart'))}</span></div>
            <div class="baris tebal"><span>Total pendapatan</span><span>${rp(pendapatan)}</span></div>
            <div class="baris"><span>Modal barang terjual (termasuk barang gratis promo)</span><span class="merah">-${rp(n('modal_jual'))}</span></div>
            <div class="baris"><span>Modal kembali dari retur</span><span>+${rp(n('modal_kembali'))}</span></div>
            <div class="baris"><span>Modal sparepart servis</span><span class="merah">-${rp(n('modal_sparepart'))}</span></div>
            <div class="baris tebal"><span>Laba kotor</span><span>${rp(kotor)}</span></div>
            <div class="baris"><span>Pengeluaran operasional</span><span class="merah">-${rp(n('pengeluaran'))}</span></div>
            <div class="baris besar"><span>LABA BERSIH</span><b class="${bersih >= 0 ? 'hijau' : 'merah'}">${rp(bersih)}</b></div>
          </div></section>`;
      animasiAngka(isi);
    }

    async function perBarang() {
      const d = await aksi('laporan_barang', { p_dari: dari, p_sampai: sampai });
      isi.innerHTML = `<div class="kartu tabel-wadah muncul"><table class="tabel"><thead><tr><th>Barang</th><th class="kanan">Terjual</th><th class="kanan">Gratis</th><th class="kanan">Penjualan</th><th class="kanan">Modal</th><th class="kanan">Laba</th></tr></thead><tbody>
        ${d.map(x => { const lb = Number(x.penjualan) - Number(x.modal); return `<tr><td><b>${esc(x.nama)}</b></td><td class="kanan">${angka(x.terjual)}</td><td class="kanan">${Number(x.gratis) || '-'}</td><td class="kanan">${rp(x.penjualan)}</td><td class="kanan">${rp(x.modal)}</td><td class="kanan"><b class="${lb >= 0 ? 'hijau' : 'merah'}">${rp(lb)}</b></td></tr>`; }).join('') || `<tr><td colspan="6">${kosong('Belum ada penjualan')}</td></tr>`}
        </tbody></table></div>`;
    }

    async function perPelanggan() {
      const d = await aksi('laporan_pelanggan', { p_dari: dari, p_sampai: sampai });
      isi.innerHTML = `<div class="kartu tabel-wadah muncul"><table class="tabel"><thead><tr><th>Pelanggan</th><th class="kanan">Belanja</th><th class="kanan">Servis</th><th class="kanan">Total</th><th class="kanan">Laba</th></tr></thead><tbody>
        ${d.map(x => `<tr class="${x.pelanggan_id ? '' : 'redup'}"><td><b>${esc(x.nama)}</b><small class="blok">${esc(x.hp || '')}</small></td><td class="kanan">${x.jml_belanja}x</td><td class="kanan">${x.jml_servis}x</td><td class="kanan">${rp(x.total)}</td><td class="kanan"><b class="hijau">${rp(x.laba)}</b></td></tr>`).join('') || `<tr><td colspan="5">${kosong('Belum ada data')}</td></tr>`}
        </tbody></table></div>`;
    }

    async function pengeluaran() {
      const [d, staf] = await Promise.all([api.ambil('pengeluaran', { gte: { tanggal: dari }, lte: { tanggal: sampai }, order: 'tanggal.desc' }), petaStaf()]);
      isi.innerHTML = `<div class="filter-bar"><b>Total: ${rp(d.reduce((a, x) => a + Number(x.nominal), 0))}</b><span class="isi-kanan"></span><button class="btn utama" id="baru">${ikon('plus', 18)} Pengeluaran</button></div>
        <div class="kartu daftar">${d.map(x => `<div class="baris-daftar"><span class="bd-ikon merah">${ikon('wallet', 18)}</span><span class="bd-utama"><b>${esc(x.keterangan)}</b><small>${tgl(x.tanggal, false)} · ${esc(staf[x.staf_id]?.nama || '')}</small></span><b>${rp(x.nominal)}</b><button class="btn-ikon" data-hapus="${x.id}">${ikon('trash', 16)}</button></div>`).join('') || kosong('Belum ada pengeluaran', 'wallet')}</div>`;
      $('#baru', isi).onclick = () => {
        const l = lembar({ judul: 'Pengeluaran baru', lebar: 420, isi: `<form id="fk">
          <label class="lbl">Tanggal</label><input class="input" type="date" name="tanggal" value="${hariIni()}">
          <label class="lbl">Keterangan</label><input class="input" name="ket" required placeholder="listrik, sewa, gaji, makan…">
          <label class="lbl">Nominal</label><input class="input besar" name="nominal" inputmode="numeric" required>
          <button class="btn utama besar penuh" type="submit">${ikon('check', 18)} Simpan</button></form>` });
        $('#fk', l.el).onsubmit = (e) => { e.preventDefault(); const f = e.target; sibuk($('[type=submit]', f), async () => {
          try { await aksi('simpan_pengeluaran', { p_tanggal: f.tanggal.value, p_ket: f.ket.value, p_nominal: Number(f.nominal.value.replace(/\D/g, '')) }); toast('Tersimpan'); l.tutup(); pengeluaran(); } catch (er) { salah(er); }
        }); };
      };
      $$('[data-hapus]', isi).forEach(b => b.onclick = async () => { if (!await konfirmasi('Hapus pengeluaran ini?', { bahaya: true, ya: 'Hapus' })) return; try { await aksi('hapus_pengeluaran', { p_id: b.dataset.hapus }); pengeluaran(); } catch (e) { salah(e); } });
    }

    await muat();
  },
};
