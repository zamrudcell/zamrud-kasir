import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, $, $$, toast, salah, lembar, sibuk, kosong, PERAN, HARI, hariIni, konfirmasi, avatar, namaStaf } from '../ui.js';
import { dataStaf, hapusCache } from '../data.js';

const JENIS_BONUS = {
  per_transaksi: 'Rp per transaksi', persen_penjualan: '% dari penjualan', per_servis: 'Rp per servis selesai', persen_jasa_servis: '% dari jasa servis',
};

function formStaf(s, saatSimpan) {
  const baru = !s; s = s || { peran: 'kasir', aktif: true, warna: '#10b981' };
  const l = lembar({ judul: baru ? 'Karyawan baru' : 'Ubah karyawan', lebar: 520, isi: `
    <form id="fs" class="form-grid">
      <label class="lbl">Kode (unik)<input class="input" name="kode" required value="${esc(s.kode || '')}" placeholder="ZC01" autocapitalize="characters"></label>
      <label class="lbl">Nama<input class="input" name="nama" required value="${esc(s.nama || '')}"></label>
      <label class="lbl">Tugas / peran<select class="input" name="peran" ${s.id === sesi.staf.id ? 'disabled' : ''}>${Object.entries(PERAN).map(([k, v]) => `<option value="${k}" ${k === s.peran ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="lbl">No HP<input class="input" name="hp" inputmode="tel" value="${esc(s.hp || '')}"></label>
      <label class="lbl">${baru ? 'PIN (6 angka)' : 'PIN baru (kosongkan bila tetap)'}<input class="input" name="pin" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" type="password" ${baru ? 'required' : ''}></label>
      <label class="lbl">Warna<input class="input" type="color" name="warna" value="${esc(s.warna || '#10b981')}"></label>
      <label class="cek s2"><input type="checkbox" name="aktif" ${s.aktif ? 'checked' : ''}> Aktif (nonaktif = tidak bisa login, sesi langsung diputus)</label>
      <label class="cek s2"><input type="checkbox" name="bebas_jadwal" ${s.bebas_jadwal ? 'checked' : ''}> Boleh login kapan saja (tanpa jadwal shift)</label>
      <p class="redup kecil s2">Kasir: berjualan & servis. Teknisi: mengerjakan servis (bonus servis). Owner: semua akses.</p>
      <button class="btn utama besar s2" type="submit">${ikon('check', 18)} Simpan</button>
      ${!baru && s.id !== sesi.staf.id ? `<button class="btn merah-garis besar s2" type="button" id="hapus-staf">${ikon('trash', 18)} Hapus karyawan</button>
      <p class="redup kecil s2">Belum pernah bertransaksi → terhapus permanen. Sudah punya riwayat → dinonaktifkan & diarsipkan, nota lamanya tetap aman.</p>` : ''}
    </form>` });
  const f = $('#fs', l.el);
  const bh = $('#hapus-staf', l.el);
  if (bh) bh.onclick = async () => {
    if (!await konfirmasi(`Hapus ${s.nama} (${s.kode})? Ia tidak bisa masuk lagi.`, { ya: 'Hapus', bahaya: true, judul: 'Hapus karyawan' })) return;
    sibuk(bh, async () => {
      try {
        const r = await aksi('hapus_staf', { p_id: s.id });
        hapusCache('staf'); toast(r === 'dihapus' ? 'Karyawan dihapus permanen' : 'Karyawan diarsipkan (riwayatnya tetap tersimpan)'); l.tutup(); saatSimpan();
      } catch (er) { salah(er); }
    });
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    sibuk($('[type=submit]', f), async () => {
      try {
        const d = Object.fromEntries(new FormData(f));
        d.aktif = f.aktif.checked; d.bebas_jadwal = f.bebas_jadwal.checked; if (!baru) d.id = s.id;
        if (s.id === sesi.staf.id) d.peran = 'owner';
        if (!d.pin) delete d.pin;
        await aksi('simpan_staf', { p_data: d }); hapusCache('staf'); toast('Karyawan disimpan'); l.tutup(); saatSimpan();
      } catch (er) { salah(er); }
    });
  };
}

function formJadwal(s, jadwal, saatSimpan) {
  const milik = jadwal.filter(j => j.staf_id === s.id);
  const l = lembar({ judul: 'Jadwal shift — ' + s.nama, lebar: 520, isi: `
    <p class="redup">Centang hari kerja & isi jam. Di luar jam ini karyawan <b>tidak bisa login</b>, dan sesinya otomatis berakhir saat shift selesai.</p>
    <div class="jadwal-form">${HARI.map((h, i) => { const j = milik.find(x => x.hari === i); return `
      <div class="jf-baris" data-h="${i}"><label class="cek"><input type="checkbox" ${j ? 'checked' : ''}> <b>${h}</b></label>
        <input class="input" type="time" value="${(j?.jam_mulai || '08:00').slice(0, 5)}"><span>–</span><input class="input" type="time" value="${(j?.jam_selesai || '17:00').slice(0, 5)}"></div>`; }).join('')}</div>
    <div class="baris-tombol"><button class="btn abu" id="salin">Samakan semua dengan Senin</button><button class="btn utama" id="ok">${ikon('check', 18)} Simpan jadwal</button></div>` });
  $('#salin', l.el).onclick = () => {
    const sn = $('[data-h="1"]', l.el); const [a, b] = $$('input[type=time]', sn);
    $$('.jf-baris', l.el).forEach(r => { const [x, y] = $$('input[type=time]', r); x.value = a.value; y.value = b.value; });
  };
  $('#ok', l.el).onclick = (e) => sibuk(e.currentTarget, async () => {
    const data = $$('.jf-baris', l.el).filter(r => $('input[type=checkbox]', r).checked).map(r => {
      const [a, b] = $$('input[type=time]', r); return { hari: Number(r.dataset.h), jam_mulai: a.value, jam_selesai: b.value };
    });
    try { await aksi('simpan_jadwal', { p_staf: s.id, p_jadwal: data }); toast('Jadwal disimpan'); l.tutup(); saatSimpan(); } catch (er) { salah(er); }
  });
}

export default {
  async tampil(el) {
    let tab = 'staf';
    el.innerHTML = `<div class="tab-garis" id="tab">${[['staf', 'Karyawan'], ['jadwal', 'Jadwal Shift'], ['tugas', 'Tugas'], ['bonus', 'Bonus']].map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'aktif' : ''}">${t}</button>`).join('')}</div><div id="isi"></div>`;
    const isi = $('#isi', el);
    const tampil = async () => {
      $$('#tab button', el).forEach(b => b.classList.toggle('aktif', b.dataset.t === tab));
      isi.innerHTML = '<div class="memuat"><span></span><span></span><span></span></div>';
      hapusCache('staf');
      const staf = (await dataStaf()).filter(x => !x.diarsip); // yang diarsip tidak tampil
      if (tab === 'staf') {
        isi.innerHTML = `<div class="filter-bar"><span class="isi-kanan"></span><button class="btn utama" id="baru">${ikon('plus', 18)} Karyawan</button></div>
          <div class="grid-kartu">${staf.map((s, i) => `<button class="kartu-staf-besar muncul ${s.aktif ? '' : 'redup'}" style="--i:${i}" data-id="${s.id}">
            ${avatar(s, 'besar')}${namaStaf(s)}<small>${esc(s.kode)} · ${PERAN[s.peran]}</small>
            <span class="pil ${s.aktif ? 'hijau' : 'merah'}">${s.aktif ? 'Aktif' : 'Nonaktif'}</span>${s.bebas_jadwal ? '<span class="pil abu">bebas jadwal</span>' : ''}</button>`).join('')}</div>`;
        $('#baru', isi).onclick = () => formStaf(null, tampil);
        $$('[data-id]', isi).forEach(b => b.onclick = () => formStaf(staf.find(s => s.id === b.dataset.id), tampil));
      }
      if (tab === 'jadwal') {
        const jadwal = await api.ambil('jadwal_shift', { order: 'hari.asc' });
        const kar = staf.filter(s => s.peran !== 'owner');
        isi.innerHTML = `<div class="kartu tabel-wadah"><table class="tabel jadwal"><thead><tr><th>Karyawan</th>${HARI.map(h => `<th>${h.slice(0, 3)}</th>`).join('')}</tr></thead><tbody>
          ${kar.map(s => `<tr data-id="${s.id}"><td><b>${esc(s.nama)}</b><small class="blok">${esc(s.kode)} · ${PERAN[s.peran]}</small></td>
          ${HARI.map((_, i) => { const j = jadwal.filter(x => x.staf_id === s.id && x.hari === i); return `<td>${s.bebas_jadwal ? '<span class="pil abu">bebas</span>' : j.map(x => `<span class="pil hijau">${x.jam_mulai.slice(0, 5)}–${x.jam_selesai.slice(0, 5)}</span>`).join('') || '<span class="redup">libur</span>'}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="8">${kosong('Belum ada karyawan')}</td></tr>`}
          </tbody></table></div><p class="redup kecil">Ketuk baris karyawan untuk mengatur jadwalnya.</p>`;
        $$('tr[data-id]', isi).forEach(r => r.onclick = () => formJadwal(staf.find(s => s.id === r.dataset.id), jadwal, tampil));
      }
      if (tab === 'tugas') {
        let tanggal = hariIni();
        isi.innerHTML = `<div class="filter-bar"><input type="date" class="input mini-tgl" id="tgl" value="${tanggal}"><span class="isi-kanan"></span><button class="btn utama" id="baru">${ikon('plus', 18)} Tugas</button></div><div class="kartu daftar" id="dt"></div>`;
        const kar = staf.filter(s => s.peran !== 'owner');
        const muatT = async () => {
          const t = await api.ambil('tugas', { eq: { tanggal }, order: 'dibuat.asc' });
          const sm = Object.fromEntries(staf.map(s => [s.id, s]));
          $('#dt', isi).innerHTML = t.length ? t.map(g => `<div class="baris-daftar">
            <span class="avatar kecil" style="--w:${esc(sm[g.staf_id]?.warna)}">${esc(sm[g.staf_id]?.nama[0] || '?')}</span>
            <span class="bd-utama"><b>${esc(g.judul)}</b><small>${esc(sm[g.staf_id]?.nama || '')}${g.keterangan ? ' · ' + esc(g.keterangan) : ''}${Number(g.bonus) ? ' · bonus ' + rp(g.bonus) : ''}</small></span>
            <span class="pil ${g.status === 'disetujui' ? 'hijau' : g.status === 'selesai' ? 'kuning' : g.status === 'ditolak' ? 'merah' : 'abu'}">${g.status}</span>
            ${g.status === 'selesai' ? `<button class="btn kecil" data-ok="${g.id}">Setujui</button><button class="btn kecil merah-garis" data-no="${g.id}">Tolak</button>` : ''}
            ${['baru', 'ditolak'].includes(g.status) ? `<button class="btn-ikon" data-hapus="${g.id}">${ikon('trash', 16)}</button>` : ''}</div>`).join('') : kosong('Belum ada tugas di tanggal ini', 'star');
          $$('[data-ok],[data-no]', isi).forEach(b => b.onclick = async () => { try { await aksi('nilai_tugas', { p_id: b.dataset.ok || b.dataset.no, p_setuju: !!b.dataset.ok }); muatT(); } catch (e) { salah(e); } });
          $$('[data-hapus]', isi).forEach(b => b.onclick = async () => { if (await konfirmasi('Hapus tugas ini?', { bahaya: true, ya: 'Hapus' })) { try { await aksi('hapus_tugas', { p_id: b.dataset.hapus }); muatT(); } catch (e) { salah(e); } } });
        };
        $('#tgl', isi).onchange = (e) => { tanggal = e.target.value; muatT(); };
        $('#baru', isi).onclick = () => {
          const l = lembar({ judul: 'Tugas baru', lebar: 460, isi: `<form id="ft" class="form-grid">
            <label class="lbl s2">Untuk<select class="input" name="staf_id" required>${kar.map(s => `<option value="${s.id}">${esc(s.kode)} — ${esc(s.nama)}</option>`).join('')}</select></label>
            <label class="lbl s2">Tugas<input class="input" name="judul" required placeholder="mis. Rapikan etalase aksesoris"></label>
            <label class="lbl s2">Keterangan<input class="input" name="keterangan"></label>
            <label class="lbl">Tanggal<input class="input" type="date" name="tanggal" value="${tanggal}"></label>
            <label class="lbl">Bonus bila disetujui (Rp)<input class="input" name="bonus" inputmode="numeric" placeholder="0"></label>
            <button class="btn utama besar s2" type="submit">${ikon('check', 18)} Simpan</button></form>` });
          $('#ft', l.el).onsubmit = (e) => { e.preventDefault(); sibuk($('[type=submit]', e.target), async () => {
            try { const d = Object.fromEntries(new FormData(e.target)); d.bonus = String(d.bonus || '').replace(/\D/g, ''); await aksi('simpan_tugas', { p_data: d }); toast('Tugas dibuat'); l.tutup(); muatT(); } catch (er) { salah(er); }
          }); };
        };
        muatT();
      }
      if (tab === 'bonus') {
        const aturan = await api.ambil('bonus_aturan', { order: 'dibuat.asc' });
        const awal = hariIni().slice(0, 8) + '01';
        isi.innerHTML = `<section class="kartu"><div class="kartu-kepala"><h3>${ikon('gear', 18)} Aturan bonus</h3></div>
          <p class="redup">Bonus dihitung otomatis dari transaksi yang <b>tercatat atas nama karyawan itu sendiri</b> (login PIN), servis yang dikerjakan teknisi, dan tugas yang disetujui.</p>
          <div id="aturan"></div><button class="btn-teks" id="tambah">${ikon('plus', 16)} Tambah aturan</button>
          <div class="baris-tombol kiri"><button class="btn utama" id="simpan">${ikon('check', 18)} Simpan aturan</button></div></section>
          <section class="kartu"><div class="kartu-kepala"><h3>${ikon('money', 18)} Rekap bonus</h3>
            <div class="gabung"><input type="date" class="input mini-tgl" id="dari" value="${awal}"><input type="date" class="input mini-tgl" id="sampai" value="${hariIni()}"></div></div>
            <div class="tabel-wadah"><table class="tabel" id="rekap"><thead><tr><th>Karyawan</th><th class="kanan">Transaksi</th><th class="kanan">Penjualan</th><th class="kanan">Servis</th><th class="kanan">Jasa servis</th><th class="kanan">Bonus tugas</th><th class="kanan">Total bonus</th></tr></thead><tbody></tbody></table></div></section>`;
        const baris = (a = {}) => `<div class="baris-aturan">
          <select class="input" data-f="target"><option value="peran:">Semua karyawan</option><option value="peran:kasir">Semua kasir</option><option value="peran:teknisi">Semua teknisi</option>
            ${staf.filter(s => s.peran !== 'owner').map(s => `<option value="staf:${s.id}">${esc(s.kode)} — ${esc(s.nama)}</option>`).join('')}</select>
          <select class="input" data-f="jenis">${Object.entries(JENIS_BONUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <input class="input mini" data-f="nilai" inputmode="decimal" value="${a.nilai ?? ''}" placeholder="nilai">
          <button class="btn-ikon" data-hapus>${ikon('trash', 16)}</button></div>`;
        const wadah = $('#aturan', isi);
        wadah.innerHTML = aturan.map(baris).join('');
        $$('.baris-aturan', wadah).forEach((r, i) => { const a = aturan[i]; $('[data-f=target]', r).value = a.staf_id ? 'staf:' + a.staf_id : 'peran:' + (a.peran || ''); $('[data-f=jenis]', r).value = a.jenis; });
        const pasangHapus = () => $$('[data-hapus]', wadah).forEach(b => b.onclick = () => b.closest('.baris-aturan').remove());
        pasangHapus();
        $('#tambah', isi).onclick = () => { wadah.insertAdjacentHTML('beforeend', baris()); pasangHapus(); };
        $('#simpan', isi).onclick = (e) => sibuk(e.currentTarget, async () => {
          const data = $$('.baris-aturan', wadah).map(r => { const [t, v] = $('[data-f=target]', r).value.split(':');
            return { peran: t === 'peran' ? v : '', staf_id: t === 'staf' ? v : '', jenis: $('[data-f=jenis]', r).value, nilai: Number(String($('[data-f=nilai]', r).value).replace(',', '.')) || 0 }; });
          try { await aksi('simpan_bonus_aturan', { p_aturan: data }); toast('Aturan bonus disimpan'); muatRekap(); } catch (er) { salah(er); }
        });
        const muatRekap = async () => {
          const r = await aksi('laporan_bonus', { p_dari: $('#dari', isi).value, p_sampai: $('#sampai', isi).value });
          $('#rekap tbody', isi).innerHTML = r.length ? r.map(x => `<tr><td><b>${esc(x.nama)}</b><small class="blok">${esc(x.kode)} · ${PERAN[x.peran]}</small></td>
            <td class="kanan">${x.jml_transaksi}</td><td class="kanan">${rp(x.penjualan)}</td><td class="kanan">${x.jml_servis}</td><td class="kanan">${rp(x.jasa_servis)}</td><td class="kanan">${rp(x.bonus_tugas)}</td><td class="kanan"><b class="hijau">${rp(x.bonus_total)}</b></td></tr>`).join('')
            : `<tr><td colspan="7">${kosong('Belum ada karyawan')}</td></tr>`;
        };
        $('#dari', isi).onchange = $('#sampai', isi).onchange = muatRekap;
        muatRekap();
      }
    };
    $$('#tab button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; tampil(); });
    await tampil();
  },
};
