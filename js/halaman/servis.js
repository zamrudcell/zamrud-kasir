import { api } from '../api.js';
import { sesi, aksi } from '../sesi.js';
import { esc, ikon, rp, tgl, $, $$, toast, salah, lembar, sibuk, kosong, STATUS_SERVIS, animasiAngka, konfirmasi } from '../ui.js';
import { dataProduk, hapusCache } from '../data.js';
import { notaServis, cetak } from '../nota.js';

const ALUR = ['antri', 'dikerjakan', 'tunggu_sparepart', 'siap_diambil', 'diambil'];
const TAB = [
  ['proses', 'Dalam Proses'], ['antri', 'Antri'], ['dikerjakan', 'Dikerjakan'], ['tunggu_sparepart', 'Tunggu Sparepart'],
  ['siap_diambil', 'Siap Diambil'], ['belum_lunas', 'Belum Lunas'], ['diambil', 'Selesai'], ['semua', 'Semua'],
];
const sisa = (v) => Number(v.total_tagihan) - Number(v.dibayar);
const angkaDari = (v) => Number(String(v || '').replace(/\D/g, '')) || 0;

export async function bukaServis(id, saatBerubah = () => {}) {
  const [v] = await api.ambil('v_servis', { eq: { id } });
  if (!v) return toast('Servis tidak ditemukan', 'err');
  const [spare, bayar, log, riwayat, mem] = await Promise.all([
    api.ambil('servis_sparepart', { eq: { servis_id: id }, order: 'dibuat.asc' }),
    api.ambil('servis_bayar', { eq: { servis_id: id }, order: 'dibuat.asc' }),
    api.ambil('servis_log', { eq: { servis_id: id }, order: 'dibuat.desc', limit: 40 }),
    v.imei ? api.ambil('servis', { select: 'id,nomor,jenis_servis,keluhan,dibuat,status', eq: { imei: v.imei }, neq: { id }, order: 'dibuat.desc' }) : [],
    api.ambil('servis', { select: 'member_id', eq: { id } }).catch(() => []), // kosong bila SQL 006 belum dijalankan
  ]);
  const member = mem?.[0]?.member_id ? ((await api.ambil('pelanggan', { select: 'nama,kode_member', eq: { id: mem[0].member_id } }).catch(() => []))[0] || { nama: 'Member', kode_member: '' }) : null;
  const st = STATUS_SERVIS[v.status];
  const idx = ALUR.indexOf(v.status);
  const selesai = ['diambil', 'batal'].includes(v.status);
  const l = lembar({ judul: v.nomor + ' · ' + v.nama, lebar: 640, isi: `
    <div class="langkah-servis">${ALUR.map((s, i) => `<div class="lk ${i < idx ? 'lewat' : i === idx ? 'kini' : ''}"><span>${ikon(STATUS_SERVIS[s].ik, 16)}</span><small>${STATUS_SERVIS[s].label}</small></div>`).join('')}</div>
    ${v.status === 'batal' ? '<div class="info-merah">Servis dibatalkan</div>' : ''}
    <div class="grid-info">
      <div><small>HP</small><b>${esc([v.merek, v.tipe].filter(Boolean).join(' ') || '-')}</b></div>
      <div><small>IMEI</small><b class="mono">${esc(v.imei || '-')}</b></div>
      <div><small>Pelanggan</small><b>${esc(v.nama)}</b><small>${esc(v.hp || '')}</small></div>
      <div><small>Jenis servis</small><b>${esc(v.jenis_servis || '-')}</b></div>
      <div class="s2"><small>Keluhan</small><b>${esc(v.keluhan || '-')}</b></div>
      ${v.kelengkapan ? `<div><small>Kelengkapan</small><b>${esc(v.kelengkapan)}</b></div>` : ''}
      ${v.kondisi ? `<div><small>Kondisi fisik</small><b>${esc(v.kondisi)}</b></div>` : ''}
      ${v.sandi_hp ? `<div><small>Sandi HP</small><b class="mono">${esc(v.sandi_hp)}</b></div>` : ''}
      <div><small>Penerima</small><b>${esc(v.nama_penerima || '-')}</b></div>
      <div><small>Teknisi</small><b>${esc(v.nama_teknisi || 'belum ada')}</b></div>
      <div><small>Masuk</small><b>${tgl(v.dibuat)}</b></div>
    </div>
    ${!selesai ? `<h4 class="sub-judul">Ubah status</h4><div class="tombol-status">${['antri', 'dikerjakan', 'tunggu_sparepart', 'siap_diambil'].map(s =>
      `<button class="pil-tombol ${STATUS_SERVIS[s].warna} ${s === v.status ? 'aktif' : ''}" data-st="${s}">${ikon(STATUS_SERVIS[s].ik, 14)} ${STATUS_SERVIS[s].label}</button>`).join('')}</div>` : ''}
    <h4 class="sub-judul">${ikon('money', 16)} Biaya</h4>
    <div class="tabel-ringkas">
      <div class="baris"><span>Estimasi awal</span><span>${rp(v.estimasi_biaya)}</span></div>
      <div class="baris"><span>Jasa servis</span><span class="gabung-kanan">${!selesai || sesi.owner ? `<input class="input mini" id="jasa" inputmode="numeric" value="${Number(v.biaya_jasa) || ''}" placeholder="0"><button class="btn kecil" id="simpan-jasa">Simpan</button>` : rp(v.biaya_jasa)}</span></div>
      ${spare.map(s => `<div class="baris"><span>${ikon('box', 14)} ${esc(s.nama)} x${s.qty}</span><span>${s.gratis ? '<span class="pil hijau">GRATIS</span>' : rp(s.harga * s.qty)} ${sesi.owner && !selesai ? `<button class="btn-ikon kecil" data-hapus-sp="${s.id}">${ikon('trash', 14)}</button>` : ''}</span></div>`).join('')}
      ${member ? `<div class="baris emas"><span>${ikon('star', 14)} Harga member: ${esc(member.nama)}</span><span></span></div>`
        : (!selesai ? `<div class="baris"><button class="btn-teks" id="pasang-member">${ikon('star', 16)} Pelanggan member? Pakai harga member</button></div>` : '')}
      ${!selesai ? `<div class="baris"><button class="btn-teks" id="tambah-sp">${ikon('plus', 16)} Tambah sparepart dari stok</button></div>` : ''}
      <div class="baris besar"><span>Total tagihan</span><b>${rp(v.total_tagihan)}</b></div>
      ${bayar.map(b => `<div class="baris redup"><span>${b.jenis === 'dp' ? 'DP' : 'Bayar'} · ${esc(b.metode)} · ${tgl(b.dibuat)}</span><span>${rp(b.nominal)}</span></div>`).join('')}
      <div class="baris ${sisa(v) > 0 ? 'merah' : 'hijau'}"><span>${sisa(v) > 0 ? 'Sisa (belum lunas)' : 'Lunas'}</span><b>${rp(Math.max(0, sisa(v)))}</b></div>
    </div>
    <div class="baris-tombol bungkus">
      <button class="btn abu" data-cetak-terima>${ikon('print', 18)} Tanda terima</button>
      ${v.status === 'siap_diambil' ? `<button class="btn utama oranye" data-ambil>${ikon('check', 18)} Pelanggan ambil HP</button>` : ''}
      ${v.status !== 'batal' && sisa(v) > 0 ? `<button class="btn utama" data-bayar>${ikon('wallet', 18)} Terima bayar</button>` : ''}
      ${v.status === 'diambil' ? `<button class="btn utama" data-cetak-nota>${ikon('print', 18)} Nota servis</button>` : ''}
      ${sesi.owner && !selesai ? `<button class="btn merah-garis" data-batal>${ikon('x', 18)} Batalkan</button>` : ''}
    </div>
    ${riwayat.length ? `<h4 class="sub-judul">${ikon('history', 16)} Riwayat HP ini (IMEI sama)</h4><div class="daftar-ringkas">${riwayat.map(r => `<button class="baris-ringkas" data-riwayat="${r.id}"><span><b>${esc(r.nomor)}</b><small>${tgl(r.dibuat, false)} · ${esc(r.jenis_servis || r.keluhan || '')}</small></span><span class="pil ${STATUS_SERVIS[r.status].warna}">${STATUS_SERVIS[r.status].label}</span></button>`).join('')}</div>` : ''}
    <details class="lipat"><summary>${ikon('clock', 16)} Catatan aktivitas (${log.length})</summary>
      <div class="linimasa">${log.map(g => `<div><b>${esc(STATUS_SERVIS[g.status]?.label || g.status)}</b> ${esc(g.catatan || '')}<small>${tgl(g.dibuat)}</small></div>`).join('')}</div></details>` });

  const segar = () => { l.tutup(); saatBerubah(); bukaServis(id, saatBerubah); };
  $$('[data-st]', l.el).forEach(b => b.onclick = async () => {
    if (b.dataset.st === v.status) return;
    try { await aksi('ubah_status_servis', { p_id: id, p_status: b.dataset.st, p_catatan: '' }); toast('Status: ' + STATUS_SERVIS[b.dataset.st].label); segar(); } catch (e) { salah(e); }
  });
  const sj = $('#simpan-jasa', l.el);
  if (sj) sj.onclick = (e) => sibuk(e.currentTarget, async () => {
    try { await aksi('ubah_servis', { p_id: id, p_data: { biaya_jasa: String(angkaDari($('#jasa', l.el).value)) } }); toast('Biaya jasa disimpan'); segar(); } catch (er) { salah(er); }
  });
  const pm = $('#pasang-member', l.el);
  if (pm) pm.onclick = () => {
    const m = lembar({ judul: 'Harga member', lebar: 420, isi: `<form id="fm">
      <p class="redup kecil">Isi <b>nomor WA</b> member. Bila terdaftar sebagai member, sparepart memakai harga member. Pengecekan tercatat.</p>
      <label class="lbl">Nomor WA member<input class="input" name="hp" inputmode="tel" value="${esc(v.hp || '')}" required></label>
      <button class="btn utama besar penuh" type="submit">${ikon('check', 18)} Pakai harga member</button></form>` });
    const f = $('#fm', m.el);
    f.onsubmit = (e) => { e.preventDefault(); sibuk($('[type=submit]', f), async () => {
      try {
        const r = await aksi('cek_member', { p_kode: '', p_hp: f.hp.value.trim() });
        if (!r?.ok) return toast('Nomor WA ini bukan member — tetap harga biasa', 'err');
        await aksi('pasang_member_servis', { p_servis: id, p_kode: r.kode, p_hp: f.hp.value.trim() });
        toast('Harga member dipakai untuk ' + r.nama); m.tutup(); segar();
      } catch (er) { salah(er); }
    }); };
  };
  const ts = $('#tambah-sp', l.el);
  if (ts) ts.onclick = () => pilihSparepart(async (p, qty) => {
    try { await aksi('tambah_sparepart_servis', { p_servis: id, p_produk: p.id, p_qty: qty }); hapusCache('produk'); toast(p.nama + ' dipakai'); segar(); } catch (e) { salah(e); }
  });
  $$('[data-hapus-sp]', l.el).forEach(b => b.onclick = async () => {
    if (!await konfirmasi('Hapus sparepart ini? Stok akan dikembalikan.', { bahaya: true, ya: 'Hapus' })) return;
    try { await aksi('hapus_sparepart_servis', { p_id: b.dataset.hapusSp }); hapusCache('produk'); segar(); } catch (e) { salah(e); }
  });
  $('[data-cetak-terima]', l.el).onclick = () => cetak(notaServis(v, spare, bayar, { tahap: 'terima' }), 'Tanda terima ' + v.nomor);
  const nc = $('[data-cetak-nota]', l.el); if (nc) nc.onclick = () => cetak(notaServis(v, spare, bayar, { tahap: 'ambil' }), 'Nota ' + v.nomor);
  const bb = $('[data-bayar]', l.el); if (bb) bb.onclick = () => formBayar(v, false, segar);
  const ba = $('[data-ambil]', l.el); if (ba) ba.onclick = () => formBayar(v, true, async () => {
    l.tutup(); saatBerubah();
    const [v2] = await api.ambil('v_servis', { eq: { id } });
    const [sp2, by2] = await Promise.all([api.ambil('servis_sparepart', { eq: { servis_id: id } }), api.ambil('servis_bayar', { eq: { servis_id: id } })]);
    cetak(notaServis(v2, sp2, by2, { tahap: 'ambil' }), 'Nota ' + v.nomor);
  });
  const bt = $('[data-batal]', l.el); if (bt) bt.onclick = async () => {
    if (!await konfirmasi('Batalkan servis ini?', { bahaya: true, ya: 'Batalkan' })) return;
    try { await aksi('ubah_status_servis', { p_id: id, p_status: 'batal', p_catatan: 'Dibatalkan owner' }); segar(); } catch (e) { salah(e); }
  };
  $$('[data-riwayat]', l.el).forEach(b => b.onclick = () => { l.tutup(); bukaServis(b.dataset.riwayat, saatBerubah); });
}

function formBayar(v, ambil, sesudah) {
  const s = Math.max(0, sisa(v));
  const l = lembar({ judul: ambil ? 'Pengambilan HP' : 'Terima pembayaran', lebar: 440, isi: `
    <div class="total-besar"><small>Sisa tagihan</small><b>${rp(s)}</b></div>
    ${ambil && Number(v.total_tagihan) === 0 ? '<div class="info-kuning">Biaya jasa masih Rp 0. Isi biaya jasa dulu bila ada.</div>' : ''}
    <div class="segmen" id="metode">${['tunai', 'transfer', 'qris'].map((m, i) => `<button class="${i ? '' : 'aktif'}" data-m="${m}">${m.toUpperCase()}</button>`).join('')}</div>
    <label class="lbl">Nominal dibayar sekarang</label>
    <input class="input besar" id="nominal" inputmode="numeric" value="${s ? s.toLocaleString('id-ID') : ''}">
    ${ambil ? '<p class="redup kecil">Bila pelanggan belum bayar penuh, sisanya tercatat sebagai <b>Belum Lunas</b>.</p>' : ''}
    <button class="btn utama besar penuh ${ambil ? 'oranye' : ''}" id="ok">${ikon('check', 18)} ${ambil ? 'Konfirmasi diambil' : 'Simpan pembayaran'}</button>` });
  let metode = 'tunai';
  $$('#metode button', l.el).forEach(b => b.onclick = () => { metode = b.dataset.m; $$('#metode button', l.el).forEach(x => x.classList.toggle('aktif', x === b)); });
  const n = $('#nominal', l.el);
  n.oninput = () => { const x = angkaDari(n.value); n.value = x ? x.toLocaleString('id-ID') : ''; };
  $('#ok', l.el).onclick = (e) => sibuk(e.currentTarget, async () => {
    try {
      const nominal = angkaDari(n.value);
      if (ambil) await aksi('ambil_servis', { p_id: v.id, p_bayar: nominal, p_metode: metode });
      else { if (!nominal) return toast('Isi nominal', 'err'); await aksi('bayar_servis', { p_id: v.id, p_nominal: nominal, p_metode: metode }); }
      toast(ambil ? 'HP sudah diambil pelanggan' : 'Pembayaran tersimpan'); l.tutup(); sesudah();
    } catch (er) { salah(er); }
  });
}

async function pilihSparepart(saatPilih) {
  const produk = await dataProduk();
  const l = lembar({ judul: 'Pilih sparepart', lebar: 520, isi: `
    <div class="kolom-cari">${ikon('search', 18)}<input class="input" id="q" placeholder="Cari sparepart…"></div>
    <div class="daftar-ringkas" id="d"></div>` });
  const gambar = (t = '') => {
    t = t.toLowerCase();
    $('#d', l.el).innerHTML = produk.filter(p => !t || p.nama.toLowerCase().includes(t) || (p.barcode || '').includes(t)).slice(0, 60).map(p => `
      <button class="baris-ringkas" data-id="${p.id}" ${p.stok <= 0 ? 'disabled' : ''}><span>${esc(p.nama)}<small class="blok">${rp(p.harga_jual)}</small></span><b class="${p.stok <= 0 ? 'merah' : ''}">stok ${p.stok}</b></button>`).join('') || kosong('Tidak ditemukan');
    $$('[data-id]', l.el).forEach(b => b.onclick = () => {
      const p = produk.find(x => x.id === b.dataset.id);
      const q = Number(prompt(`Jumlah ${p.nama} dipakai?`, '1')) || 0;
      if (q > 0) { l.tutup(); saatPilih(p, q); }
    });
  };
  $('#q', l.el).oninput = (e) => gambar(e.target.value.trim());
  gambar(); setTimeout(() => $('#q', l.el).focus(), 300);
}

function formBaru(saatSimpan) {
  const l = lembar({ judul: 'Service baru', lebar: 620, isi: `
    <form id="fs" class="form-grid">
      <label class="lbl">Nama pelanggan<input class="input" name="nama" required autocomplete="off"></label>
      <label class="lbl">No HP / WA<input class="input" name="hp" inputmode="tel" autocomplete="off"></label>
      <div class="s2 saran" id="saran"></div>
      <label class="lbl">Merek<input class="input" name="merek" list="daftar-merek" placeholder="Oppo, iPhone, Samsung…"></label>
      <label class="lbl">Tipe<input class="input" name="tipe" placeholder="A5s, 11 Pro…"></label>
      <label class="lbl s2">IMEI / Serial<input class="input mono" name="imei" inputmode="numeric" placeholder="*#06#"></label>
      <div class="s2 info-kuning" id="info-imei" hidden></div>
      <label class="lbl s2">Jenis servis<input class="input" name="jenis_servis" list="daftar-jenis" placeholder="Ganti LCD, ganti baterai, mati total…"></label>
      <label class="lbl s2">Keluhan<textarea class="input" name="keluhan" rows="2" required></textarea></label>
      <label class="lbl">Kelengkapan<input class="input" name="kelengkapan" placeholder="HP, charger, case, SIM…"></label>
      <label class="lbl">Kondisi fisik<input class="input" name="kondisi" placeholder="lecet, retak…"></label>
      <label class="lbl">Sandi/pola HP<input class="input" name="sandi_hp" autocomplete="off"></label>
      <label class="lbl">Estimasi biaya<input class="input" name="estimasi_biaya" inputmode="numeric"></label>
      <label class="lbl">DP (uang muka)<input class="input" name="dp" inputmode="numeric" placeholder="0"></label>
      <label class="lbl">Garansi servis (hari)<input class="input" name="garansi_hari" inputmode="numeric" value="${sesi.pengaturan?.garansi_servis_hari ?? 30}"></label>
      <datalist id="daftar-merek">${['iPhone', 'Samsung', 'Oppo', 'Vivo', 'Xiaomi', 'Redmi', 'Realme', 'Infinix', 'Tecno', 'Nokia', 'Huawei', 'Poco', 'Itel'].map(m => `<option value="${m}">`).join('')}</datalist>
      <datalist id="daftar-jenis">${['Ganti LCD', 'Ganti baterai', 'Ganti konektor cas', 'Mati total', 'Bootloop', 'Lupa sandi / pola', 'Flash software', 'Speaker / mic', 'Kamera', 'Kena air', 'Sinyal hilang', 'Ganti backdoor'].map(m => `<option value="${m}">`).join('')}</datalist>
      <button class="btn utama besar oranye s2" type="submit">${ikon('plus', 18)} Simpan & cetak tanda terima</button>
    </form>` });
  const f = $('#fs', l.el);
  ['estimasi_biaya', 'dp'].forEach(n => f[n].oninput = () => { const x = angkaDari(f[n].value); f[n].value = x ? x.toLocaleString('id-ID') : ''; });
  let tunda;
  f.hp.oninput = () => { clearTimeout(tunda); tunda = setTimeout(async () => {
    const hp = f.hp.value.replace(/[^0-9+]/g, ''); if (hp.length < 6) return ($('#saran', l.el).innerHTML = '');
    const p = await api.satu('pelanggan', { eq: { hp } });
    $('#saran', l.el).innerHTML = p ? `<span class="pil hijau">${ikon('user', 12)} Pelanggan lama: ${esc(p.nama)}</span>` : '';
    if (p && !f.nama.value) f.nama.value = p.nama;
  }, 400); };
  f.imei.onchange = async () => {
    const im = f.imei.value.trim(); const box = $('#info-imei', l.el);
    if (im.length < 6) return (box.hidden = true);
    const r = await api.ambil('servis', { select: 'nomor,jenis_servis,keluhan,dibuat', eq: { imei: im }, order: 'dibuat.desc', limit: 5 });
    box.hidden = !r.length;
    box.innerHTML = r.length ? `${ikon('history', 14)} HP ini pernah servis ${r.length}x: ` + r.map(x => `${esc(x.nomor)} (${esc(x.jenis_servis || x.keluhan)})`).join(', ') : '';
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    sibuk($('[type=submit]', f), async () => {
      try {
        const d = Object.fromEntries(new FormData(f));
        d.estimasi_biaya = String(angkaDari(d.estimasi_biaya)); d.dp = String(angkaDari(d.dp));
        const h = await aksi('buat_servis', { p_data: d });
        toast('Servis ' + h.nomor + ' tersimpan'); l.tutup(); saatSimpan();
        const [v] = await api.ambil('v_servis', { eq: { id: h.id } });
        const by = await api.ambil('servis_bayar', { eq: { servis_id: h.id } });
        cetak(notaServis(v, [], by, { tahap: 'terima' }), 'Tanda terima ' + h.nomor);
      } catch (er) { salah(er); }
    });
  };
  setTimeout(() => f.nama.focus(), 300);
}

export default {
  async tampil(el, { params }) {
    let tab = 'proses', q = '';
    el.innerHTML = `
      <section class="grid-status" id="ringkas">${'<div class="kotak-status kerangka"></div>'.repeat(5)}</section>
      <section class="kartu-hangat muncul d2">
        <h2>${ikon('tool', 24)} Daftar Service</h2>
        <form class="cari-oranye" id="f-cari"><input class="input" id="q" placeholder="Cari no / nama / HP / merek / IMEI…"><button class="btn-ikon oranye" type="submit">${ikon('search', 20)}</button></form>
        <button class="btn utama oranye besar penuh" id="baru">${ikon('plus', 20)} Service Baru</button>
      </section>
      <div class="tab-garis" id="tab">${TAB.map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'aktif' : ''}">${t}</button>`).join('')}</div>
      <div class="kartu daftar" id="daftar"></div>`;

    const muat = async () => {
      $('#daftar', el).innerHTML = '<div class="memuat"><span></span><span></span><span></span></div>';
      const semua = await api.ambil('v_servis', {
        or: q ? ['nomor', 'nama', 'hp', 'merek', 'tipe', 'imei'].map(k => `${k}.ilike.*${q.replace(/[(),]/g, ' ')}*`).join(',') : undefined,
        order: 'dibuat.desc', limit: 500,
      });
      const proses = semua.filter(v => ['antri', 'dikerjakan', 'tunggu_sparepart', 'siap_diambil'].includes(v.status));
      const belum = semua.filter(v => v.status === 'diambil' && sisa(v) > 0);
      const hit = (s) => semua.filter(v => v.status === s).length;
      $('#ringkas', el).innerHTML = `
        ${['antri', 'dikerjakan', 'tunggu_sparepart', 'siap_diambil'].map((s, i) => `<button class="kotak-status ${STATUS_SERVIS[s].warna} muncul" style="--i:${i}" data-t="${s}"><small>${ikon(STATUS_SERVIS[s].ik, 14)} ${STATUS_SERVIS[s].label.toUpperCase()}</small><b data-hitung="${hit(s)}">0</b></button>`).join('')}
        <button class="kotak-status merah lebar muncul" style="--i:4" data-t="belum_lunas"><small>${ikon('wallet', 14)} BELUM LUNAS</small><b data-hitung="${belum.reduce((a, v) => a + sisa(v), 0)}" data-rp>Rp 0</b><em>${belum.length} order sudah diambil</em></button>`;
      animasiAngka($('#ringkas', el));
      $$('#ringkas [data-t]', el).forEach(b => b.onclick = () => pilihTab(b.dataset.t));
      const daftar = tab === 'semua' ? semua : tab === 'proses' ? proses : tab === 'belum_lunas' ? belum : semua.filter(v => v.status === tab);
      $('#daftar', el).innerHTML = daftar.length ? daftar.map((v, i) => `
        <button class="baris-servis muncul" style="--i:${Math.min(i, 15)}" data-id="${v.id}">
          <div class="bs-atas"><b class="bs-no">${esc(v.nomor)}</b><small>· ${tgl(v.dibuat)}</small><span class="pil ${STATUS_SERVIS[v.status].warna}">${STATUS_SERVIS[v.status].label}</span></div>
          <div class="bs-bawah"><span><b class="bs-nama">${esc(v.nama)}</b><small>${esc([v.merek, v.tipe].filter(Boolean).join(' '))}${v.jenis_servis ? ' · ' + esc(v.jenis_servis) : ''}</small></span>
            <b class="bs-harga">${Number(v.total_tagihan) ? rp(v.total_tagihan) : '± ' + rp(v.estimasi_biaya)}${v.status === 'diambil' && sisa(v) > 0 ? `<small class="merah">sisa ${rp(sisa(v))}</small>` : ''}</b></div>
        </button>`).join('') : kosong('Tidak ada servis di sini', 'tool');
      $$('.baris-servis', el).forEach(b => b.onclick = () => bukaServis(b.dataset.id, muat));
    };
    const pilihTab = (t) => { tab = t; $$('#tab button', el).forEach(b => b.classList.toggle('aktif', b.dataset.t === t)); $(`#tab [data-t="${t}"]`, el)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); muat(); };
    $$('#tab button', el).forEach(b => b.onclick = () => pilihTab(b.dataset.t));
    $('#f-cari', el).onsubmit = (e) => { e.preventDefault(); q = $('#q', el).value.trim(); if (q) tab = 'semua'; pilihTab(tab); };
    $('#baru', el).onclick = () => formBaru(muat);
    await muat();
    if (params.get('baru')) formBaru(muat);
    if (params.get('buka')) bukaServis(params.get('buka'), muat);
  },
};
