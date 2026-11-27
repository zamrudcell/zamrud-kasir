import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, tgl, $, $$, toast, salah, sibuk, konfirmasi } from '../ui.js';
import { petaStaf } from '../data.js';
import { ukuranNota, setUkuranNota } from '../nota.js';
import { VERSI } from '../config.js';
import { tema, setTema, suaraNyala, setSuara } from '../efek.js';

const AKSI = {
  masuk: 'masuk shift', keluar: 'akhiri shift', pin_salah: 'PIN salah', masuk_ditolak_diluar_shift: 'mencoba masuk di luar shift',
  transaksi: 'transaksi', batal_transaksi: 'membatalkan transaksi', ajukan_retur: 'mengajukan retur', putuskan_retur: 'memutus retur',
  servis_baru: 'servis baru', ubah_servis: 'ubah servis', bayar_servis: 'pembayaran servis', ambil_servis: 'servis diambil',
  simpan_produk: 'simpan produk', ubah_harga_massal: 'ubah harga massal', simpan_promo: 'simpan promo', simpan_staf: 'simpan karyawan',
  simpan_jadwal: 'ubah jadwal', simpan_pengaturan: 'ubah pengaturan', buat_opname: 'mulai opname', final_opname: 'finalisasi opname',
  ganti_pin: 'ganti PIN', simpan_bonus: 'ubah aturan bonus', pengeluaran: 'pengeluaran', hapus_pengeluaran: 'hapus pengeluaran', hapus_sparepart: 'hapus sparepart',
};

export default {
  async tampil(el) {
    const p = sesi.pengaturan || {};
    el.innerHTML = `
      ${sesi.owner ? `<section class="kartu muncul"><div class="kartu-kepala"><h3>${ikon('gear', 18)} Data toko & nota</h3></div>
        <form id="ft" class="form-grid">
          <label class="lbl">Nama toko<input class="input" name="nama_toko" value="${esc(p.nama_toko || '')}"></label>
          <label class="lbl">Telepon / WA<input class="input" name="telepon" value="${esc(p.telepon || '')}"></label>
          <label class="lbl s2">Alamat<input class="input" name="alamat" value="${esc(p.alamat || '')}"></label>
          <label class="lbl s2">Catatan bawah nota<input class="input" name="catatan_nota" value="${esc(p.catatan_nota || '')}"></label>
          <label class="lbl s2">Syarat garansi (tercetak di nota)<textarea class="input" name="syarat_garansi" rows="3">${esc(p.syarat_garansi || '')}</textarea></label>
          <label class="lbl">Garansi barang default (hari)<input class="input" name="garansi_jual_hari" inputmode="numeric" value="${p.garansi_jual_hari ?? 7}"></label>
          <label class="lbl">Garansi servis default (hari)<input class="input" name="garansi_servis_hari" inputmode="numeric" value="${p.garansi_servis_hari ?? 30}"></label>
          <label class="lbl">Batas stok menipis default<input class="input" name="stok_minimum_default" inputmode="numeric" value="${p.stok_minimum_default ?? 3}"></label>
          <label class="lbl">Kunci layar otomatis (menit)<input class="input" name="menit_kunci" inputmode="numeric" value="${p.menit_kunci ?? 2}"></label>
          <button class="btn utama s2" type="submit">${ikon('check', 18)} Simpan pengaturan</button>
        </form></section>` : ''}
      <section class="kartu muncul"><div class="kartu-kepala"><h3>${ikon('star', 18)} Tampilan & suara (perangkat ini)</h3></div>
        <div class="segmen" id="tema">${[['kaca', 'Kaca Mewah'], ['terang', 'Terang']].map(([v, t]) => `<button data-v="${v}" class="${tema() === v ? 'aktif' : ''}">${t}</button>`).join('')}</div>
        <label class="cek" style="margin-left:14px"><input type="checkbox" id="suara" ${suaraNyala() ? 'checked' : ''}> Suara efek & musik (boing, fokus, saklar, musik pembuka)</label>
      </section>
      <div class="dua-kolom">
        <section class="kartu muncul d1"><div class="kartu-kepala"><h3>${ikon('print', 18)} Ukuran nota (perangkat ini)</h3></div>
          <div class="segmen" id="nota">${[['58', 'Thermal 58mm'], ['80', 'Thermal 80mm'], ['A4', 'Kertas A4']].map(([v, t]) => `<button data-v="${v}" class="${ukuranNota() === v ? 'aktif' : ''}">${t}</button>`).join('')}</div>
          <p class="redup kecil">Di iPhone: Cetak → pilih printer AirPrint, atau cubit/zoom pratinjau untuk simpan PDF & bagikan ke WhatsApp.</p></section>
        <section class="kartu muncul d2"><div class="kartu-kepala"><h3>${ikon('lock', 18)} Ganti PIN saya</h3></div>
          <form id="fpin"><input class="input" name="lama" type="password" inputmode="numeric" maxlength="6" placeholder="PIN lama" required>
          <input class="input" name="baru" type="password" inputmode="numeric" maxlength="6" placeholder="PIN baru (6 angka)" required>
          <input class="input" name="ulang" type="password" inputmode="numeric" maxlength="6" placeholder="Ulangi PIN baru" required>
          <button class="btn utama penuh" type="submit">Ganti PIN</button></form></section>
      </div>
      <section class="kartu muncul d3"><div class="kartu-kepala"><h3>${ikon('shield', 18)} Akun toko</h3></div>
        <div class="baris-ringkas"><span>Login sebagai<small class="blok">${esc(api.email)}</small></span><button class="btn merah-garis" id="keluar-toko">${ikon('logout', 16)} Keluar akun toko</button></div>
        <p class="redup kecil">ZAMRUD KASIR v${VERSI} · data tersimpan online (Supabase) · aman dari manipulasi antar karyawan.</p></section>
      ${sesi.owner ? `<section class="kartu muncul d4"><div class="kartu-kepala"><h3>${ikon('history', 18)} Log aktivitas</h3><select class="input" id="log-staf"><option value="">Semua</option></select></div><div class="linimasa" id="log"></div></section>` : ''}`;

    const ft = $('#ft', el);
    if (ft) ft.onsubmit = (e) => { e.preventDefault(); sibuk($('[type=submit]', ft), async () => {
      try { const d = Object.fromEntries(new FormData(ft)); await aksi('simpan_pengaturan', { p_data: d }); sesi.pengaturan = await api.satu('pengaturan'); toast('Pengaturan disimpan'); } catch (er) { salah(er); }
    }); };
    $$('#tema button', el).forEach(b => b.onclick = () => { setTema(b.dataset.v); $$('#tema button', el).forEach(x => x.classList.toggle('aktif', x === b)); });
    $('#suara', el).onchange = (e) => setSuara(e.target.checked);
    $$('#nota button', el).forEach(b => b.onclick = () => { setUkuranNota(b.dataset.v); $$('#nota button', el).forEach(x => x.classList.toggle('aktif', x === b)); toast('Ukuran nota: ' + b.textContent); });
    $('#fpin', el).onsubmit = (e) => { e.preventDefault(); const f = e.target;
      if (f.baru.value !== f.ulang.value) return toast('PIN baru tidak sama', 'err');
      sibuk($('[type=submit]', f), async () => { try { await aksi('ganti_pin_sendiri', { p_pin_lama: f.lama.value, p_pin_baru: f.baru.value }); f.reset(); toast('PIN diganti'); } catch (er) { salah(er); } });
    };
    $('#keluar-toko', el).onclick = async () => {
      if (!await konfirmasi('Keluar dari akun toko di perangkat ini? Semua karyawan harus login ulang dengan email & sandi toko.', { bahaya: true, ya: 'Keluar' })) return;
      await sesi.keluar(); await api.keluar(); location.hash = ''; location.reload();
    };
    if (sesi.owner) {
      const staf = await petaStaf();
      $('#log-staf', el).innerHTML += Object.values(staf).map(s => `<option value="${s.id}">${esc(s.nama)}</option>`).join('');
      const muatLog = async (sid = '') => {
        const d = await api.ambil('log_aktivitas', { eq: { staf_id: sid || undefined }, order: 'dibuat.desc', limit: 150 });
        $('#log', el).innerHTML = d.map(x => `<div class="${x.aksi.includes('salah') || x.aksi.includes('ditolak') || x.aksi.startsWith('batal') ? 'merah' : ''}"><b>${esc(staf[x.staf_id]?.nama || '-')}</b> ${esc(AKSI[x.aksi] || x.aksi)} ${x.detail?.nomor ? esc(x.detail.nomor) : ''}${x.detail?.total ? ' · Rp ' + Number(x.detail.total).toLocaleString('id-ID') : ''}<small>${tgl(x.dibuat)}</small></div>`).join('') || '<p class="redup">Belum ada aktivitas</p>';
      };
      $('#log-staf', el).onchange = (e) => muatLog(e.target.value);
      muatLog();
    }
  },
};
