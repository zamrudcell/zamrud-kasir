// ZAMRUD KASIR — alur utama: pembuka → login akun toko → PIN karyawan → aplikasi
import { api } from './api.js';
import { sesi, aksi, aturSaatSesiHabis, aturSaatTerkunci, mulaiPemantauKunci, setTerkunci } from './sesi.js';
import { esc, ikon, $, $$, toast, salah, sibuk, lembar, PERAN, konfirmasi, avatar, namaStaf } from './ui.js';
import { VERSI } from './config.js';
import { terapkanTema, saklarLogo, mulaiMusik, hentikanMusik, menuDorong, sfx, tombolMusik, saatMusikBerubah, musikJalan } from './efek.js';

terapkanTema();

const HALAMAN = {
  beranda:   { judul: 'Beranda', ik: 'home', grup: 'UTAMA', muat: () => import('./halaman/beranda.js') },
  kasir:     { judul: 'Kasir', ik: 'kasir', grup: 'UTAMA', peran: ['owner', 'kasir'], muat: () => import('./halaman/kasir.js') },
  transaksi: { judul: 'Riwayat Transaksi', ik: 'list', grup: 'UTAMA', muat: () => import('./halaman/transaksi.js') },
  servis:    { judul: 'Service Elektronik', pendek: 'Servis', ik: 'tool', grup: 'UTAMA', muat: () => import('./halaman/servis.js') },
  produk:    { judul: 'Produk & Stok', pendek: 'Produk', ik: 'box', grup: 'GUDANG', muat: () => import('./halaman/produk.js') },
  opname:    { judul: 'Stok Opname (Audit Stok)', pendek: 'Stok Opname', ik: 'clip', grup: 'GUDANG', muat: () => import('./halaman/opname.js') },
  retur:     { judul: 'Retur Barang', pendek: 'Retur', ik: 'retur', grup: 'GUDANG', muat: () => import('./halaman/retur.js') },
  pelanggan: { judul: 'Pelanggan & Riwayat HP', pendek: 'Pelanggan', ik: 'users', grup: 'GUDANG', muat: () => import('./halaman/pelanggan.js') },
  tugas:     { judul: 'Tugas & Bonus Saya', pendek: 'Tugas Saya', ik: 'star', grup: 'KARYAWAN', peran: ['kasir', 'teknisi'], muat: () => import('./halaman/tugas.js') },
  karyawan:  { judul: 'Karyawan, Shift & Bonus', pendek: 'Karyawan', ik: 'user', grup: 'OWNER', peran: ['owner'], muat: () => import('./halaman/karyawan.js') },
  promo:     { judul: 'Harga & Promo', pendek: 'Harga & Promo', ik: 'gift', grup: 'OWNER', peran: ['owner'], muat: () => import('./halaman/promo.js') },
  laporan:   { judul: 'Laporan', ik: 'chart', grup: 'OWNER', peran: ['owner'], muat: () => import('./halaman/laporan.js') },
  pengaturan:{ judul: 'Pengaturan', ik: 'gear', grup: 'OWNER', muat: () => import('./halaman/pengaturan.js') },
  menu:      { judul: 'Menu', ik: 'menu', tersembunyi: true, muat: () => import('./halaman/menu.js') },
};
export { HALAMAN };

export const bolehBuka = (id) => {
  const h = HALAMAN[id]; if (!h) return false;
  return !h.peran || h.peran.includes(sesi.staf?.peran);
};

const akar = document.getElementById('akar');

// ======================= PEMBUKA (logo animasi) =======================
function pembuka() {
  return new Promise(selesai => {
    let sudah = false;
    try { if (sessionStorage.getItem('zk_pembuka')) return selesai(); } catch {}
    const el = document.createElement('div');
    el.className = 'pembuka';
    el.innerHTML = `<video src="assets/pembuka.mp4" muted playsinline autoplay preload="auto" poster="assets/pembuka-akhir.jpg"></video>
      <button class="lewati">Lewati</button>`;
    document.body.appendChild(el);
    const v = $('video', el);
    const akhiri = () => {
      if (sudah) return; sudah = true;
      try { sessionStorage.setItem('zk_pembuka', '1'); } catch {}
      el.classList.add('pudar');
      setTimeout(() => { el.remove(); }, 700);
      selesai();
    };
    // musik Zamrud (iPhone baru mengizinkan suara setelah layar disentuh)
    mulaiMusik();
    el.addEventListener('pointerdown', mulaiMusik, { once: true });
    v.addEventListener('ended', () => setTimeout(akhiri, 400));
    v.addEventListener('error', () => setTimeout(akhiri, 1200));
    $('.lewati', el).onclick = akhiri;
    setTimeout(akhiri, 12000);
  });
}

// ======================= LOGIN AKUN TOKO =======================
function layarLogin(pesan = '') {
  akar.innerHTML = `<div class="layar-masuk">
    <div class="kartu-masuk muncul">
      <img src="assets/logo.jpg" class="logo-masuk" alt="Zamrud Cell">
      <h1>ZAMRUD KASIR</h1>
      <p class="sub">Masuk dengan akun toko</p>
      ${pesan ? `<div class="info-merah">${esc(pesan)}</div>` : ''}
      <form id="f-login">
        <label class="lbl">Email</label>
        <input class="input" name="email" type="email" autocomplete="username" required placeholder="email@toko.com">
        <label class="lbl">Sandi</label>
        <div class="input-sandi"><input class="input" name="sandi" type="password" autocomplete="current-password" required placeholder="••••••••">
          <button type="button" class="btn-ikon lihat" aria-label="Lihat sandi">${ikon('search', 18)}</button></div>
        <button type="submit" hidden></button>
        <div id="tempat-saklar"></div>
      </form>
      <p class="versi">Zamrud Cell · v${VERSI}</p>
    </div></div>`;
  $('.lihat').onclick = () => { const i = $('[name=sandi]'); i.type = i.type === 'password' ? 'text' : 'password'; };
  const f = $('#f-login');
  let proses = false;
  const saklar = saklarLogo({ label: 'Ketuk untuk masuk', saatTekan: () => kirim() });
  $('#tempat-saklar').appendChild(saklar.el);
  async function kirim() {
    if (proses) return;
    if (!f.reportValidity()) return;
    proses = true; saklar.nyalakan(); mulaiMusik();
    try {
      await Promise.all([api.masuk(f.email.value.trim(), f.sandi.value), saklar.selesai()]);
      await mulai();
    } catch (er) { saklar.matikan(); salah(er); }
    finally { proses = false; }
  }
  f.onsubmit = (e) => { e.preventDefault(); kirim(); };
}

// ======================= SETUP PERTAMA =======================
function layarSetupOwner() {
  akar.innerHTML = `<div class="layar-masuk"><div class="kartu-masuk muncul">
    <img src="assets/gem.png?v=2" class="logo-masuk kecil" alt="">
    <h1>Selamat datang 👋</h1>
    <p class="sub">Buat akun <b>Owner</b> pertama. Owner yang mengatur karyawan, shift, harga, promo dan bonus.</p>
    <form id="f-owner">
      <label class="lbl">Kode owner</label><input class="input" name="kode" required value="OWNER" maxlength="12">
      <label class="lbl">Nama</label><input class="input" name="nama" required placeholder="Nama owner">
      <label class="lbl">PIN (6 angka)</label><input class="input" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required type="password">
      <label class="lbl">Ulangi PIN</label><input class="input" name="pin2" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required type="password">
      <button class="btn utama besar penuh" type="submit">Buat Owner</button>
    </form></div></div>`;
  $('#f-owner').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.pin.value !== f.pin2.value) return toast('PIN tidak sama', 'err');
    await sibuk($('button', f), async () => {
      try {
        await api.rpc('buat_owner_pertama', { p_kode: f.kode.value, p_nama: f.nama.value, p_pin: f.pin.value });
        toast('Owner dibuat. Silakan masuk.');
        await sesi.masuk(f.kode.value, f.pin.value);
        await bukaAplikasi();
      } catch (er) { salah(er); }
    });
  };
}

// ======================= PIN KARYAWAN =======================
function papanPin({ judul, sub, kodeTetap = '', saatKirim, tombolBawah = '' }) {
  const wadah = document.createElement('div');
  wadah.className = 'layar-pin';
  wadah.innerHTML = `<div class="kartu-pin muncul">
      <img src="assets/gem.png?v=2" class="logo-pin" alt="">
      <h2>${esc(judul)}</h2><p class="sub">${esc(sub)}</p>
      <input class="input kode-staf" placeholder="Kode karyawan (mis. ZC01)" autocapitalize="characters" autocomplete="off" value="${esc(kodeTetap)}" ${kodeTetap ? 'readonly' : ''}>
      <div class="titik-pin">${'<i></i>'.repeat(6)}</div>
      <div class="pesan-pin"></div>
      <div class="tombol-pin">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>
      ${tombolBawah}
    </div>`;
  let pin = '', timerIntip = [];
  const titik = $$('.titik-pin i', wadah), pesan = $('.pesan-pin', wadah), kode = $('.kode-staf', wadah);
  const gambar = () => titik.forEach((t, i) => { if (!t.classList.contains('intip')) t.classList.toggle('isi', i < pin.length); });
  const bersihIntip = () => { timerIntip.forEach(clearTimeout); timerIntip = []; titik.forEach(t => { t.classList.remove('intip'); t.textContent = ''; }); };
  const intip = (i, angka) => {
    const t = titik[i]; t.classList.remove('isi'); t.classList.add('intip'); t.textContent = angka;
    timerIntip.push(setTimeout(() => { t.classList.remove('intip'); t.textContent = ''; t.classList.toggle('isi', i < pin.length); if (i < pin.length) sfx('pop'); }, 650));
  };
  const goyang = (m) => { pesan.textContent = m; wadah.querySelector('.kartu-pin').classList.remove('goyang'); void wadah.offsetWidth; wadah.querySelector('.kartu-pin').classList.add('goyang'); pin = ''; bersihIntip(); gambar(); };
  const tekan = async (n) => {
    mulaiMusik();
    if (wadah.classList.contains('memproses')) return;
    sfx('click');
    if (n === 'C') { pin = ''; bersihIntip(); }
    else if (n === '⌫') { pin = pin.slice(0, -1); const t = titik[pin.length]; if (t) { t.classList.remove('intip'); t.textContent = ''; } }
    else if (pin.length < 6) { pin += n; intip(pin.length - 1, n); }
    gambar(); pesan.textContent = '';
    if (pin.length === 6) {
      if (!kode.value.trim()) { goyang('Isi kode karyawan dulu'); kode.focus(); return; }
      wadah.classList.add('memproses');
      await new Promise(r => setTimeout(r, 350)); // angka terakhir sempat terlihat
      try { await saatKirim(kode.value.trim().toUpperCase(), pin); }
      catch (e) { goyang(e.message); }
      finally { wadah.classList.remove('memproses'); }
    }
  };
  $$('.tombol-pin button', wadah).forEach(b => b.onclick = () => tekan(b.dataset.n === '0' ? '0' : isNaN(b.dataset.n) ? b.dataset.n : b.dataset.n));
  wadah.addEventListener('keydown', e => {
    if (e.target === kode) return;
    if (/^[0-9]$/.test(e.key)) tekan(e.key); else if (e.key === 'Backspace') tekan('⌫');
  });
  wadah.tabIndex = -1;
  return wadah;
}

function layarPin(pesan = '') {
  setTerkunci(false);
  document.querySelector('.layar-kunci')?.remove();
  akar.innerHTML = '';
  const p = papanPin({
    judul: 'Masuk Shift', sub: pesan || 'Masukkan kode & PIN Anda. Semua transaksi tercatat atas nama Anda.',
    tombolBawah: `<button class="btn-teks keluar-toko">${ikon('logout', 16)} Keluar akun toko (${esc(api.email)})</button>`,
    saatKirim: async (kode, pin) => { await sesi.masuk(kode, pin); await bukaAplikasi(); },
  });
  akar.appendChild(p);
  $('.keluar-toko', p).onclick = async () => {
    if (!await konfirmasi('Keluar dari akun toko di perangkat ini?', { ya: 'Keluar', bahaya: true })) return;
    await api.keluar(); layarLogin();
  };
  setTimeout(() => $('.kode-staf', p).focus(), 300);
}

function kunciLayar() {
  if (!sesi.staf || document.querySelector('.layar-kunci')) return;
  setTerkunci(true);
  const s = sesi.staf;
  const p = papanPin({
    judul: 'Layar Terkunci', sub: `${s.nama} (${s.kode}) — masukkan PIN untuk melanjutkan`, kodeTetap: s.kode,
    tombolBawah: `<button class="btn-teks ganti">${ikon('users', 16)} Ganti karyawan</button>`,
    saatKirim: async (kode, pin) => {
      await sesi.masuk(kode, pin);
      p.remove(); setTerkunci(false);
    },
  });
  p.classList.add('layar-kunci');
  document.body.appendChild(p);
  $('.ganti', p).onclick = async () => { p.remove(); await sesi.keluar(); layarPin('Silakan masuk dengan kode & PIN Anda'); };
  setTimeout(() => p.focus(), 100);
}

// ======================= KERANGKA APLIKASI =======================
function navItem(id) {
  const h = HALAMAN[id];
  return `<a href="#/${id}" class="nav-item" data-id="${id}">${ikon(h.ik)}<span>${esc(h.pendek || h.judul)}</span></a>`;
}

function kerangka() {
  const s = sesi.staf;
  const grup = {};
  for (const [id, h] of Object.entries(HALAMAN)) {
    if (h.tersembunyi || !bolehBuka(id)) continue;
    (grup[h.grup] ||= []).push(id);
  }
  const tengah = sesi.bisaJual ? 'kasir' : 'servis';
  const tab = ['beranda', sesi.bisaJual ? 'servis' : 'produk', tengah, sesi.bisaJual ? 'produk' : 'opname', 'menu'];
  akar.innerHTML = `<div class="app">
    <aside class="sidebar">
      <div class="merek"><div class="ubin-logo"><img src="assets/gem.png?v=2" alt=""></div><div><b>ZAMRUD</b><small>KASIR</small></div></div>
      <nav class="nav">${Object.entries(grup).map(([g, ids]) => `<div class="nav-grup">${g}</div>${ids.map(navItem).join('')}`).join('')}</nav>
      <div class="kartu-staf">
        ${avatar(s)}
        <div class="info">${namaStaf(s)}<small>${esc(PERAN[s.peran])} · ${esc(s.kode)}</small></div>
        <button class="btn-ikon" data-kunci title="Kunci layar">${ikon('lock', 18)}</button>
        <button class="btn-ikon" data-keluar title="Akhiri shift">${ikon('logout', 18)}</button>
      </div>
    </aside>
    <main class="utama">
      <header class="topbar">
        <h1 id="judul-halaman">Beranda</h1>
        <div class="topbar-kanan">
          <button class="btn-musik" aria-label="Musik" title="Putar / hentikan musik"><i></i><i></i><i></i><i></i></button>
          <span class="chip-staf" data-kunci>${ikon('user', 14)} ${esc(s.nama)}</span>
          <button class="btn-ikon lonceng" aria-label="Notifikasi">${ikon('bell')}<b class="lencana" hidden>0</b></button>
        </div>
      </header>
      <div id="halaman" class="halaman"></div>
      <footer class="kaki-app">© ${new Date().getFullYear()} Zamrud Cell · ZAMRUD KASIR v${VERSI}</footer>
    </main>
    <nav class="tabbar">
      ${tab.map(id => id === tengah
        ? `<a href="#/${id}" class="tab tengah" data-id="${id}"><span class="tab-pil">${ikon(HALAMAN[id].ik, 28)}</span></a>`
        : `<a href="#/${id}" class="tab" data-id="${id}"><span class="tab-pil">${ikon(HALAMAN[id].ik, 20)}<small>${esc(HALAMAN[id].pendek || HALAMAN[id].judul)}</small></span></a>`).join('')}
    </nav>
  </div>`;
  $$('[data-kunci]').forEach(b => b.onclick = kunciLayar);
  $('[data-keluar]').onclick = async () => {
    if (!await konfirmasi('Akhiri shift Anda sekarang?', { ya: 'Akhiri shift' })) return;
    await sesi.keluar(); layarPin('Shift diakhiri. Sampai jumpa!');
  };
  $('.lonceng').onclick = bukaNotifikasi;
  const bm = $('.btn-musik');
  const segarMusik = (jalan) => bm && bm.classList.toggle('jalan', jalan);
  bm.onclick = () => tombolMusik();
  segarMusik(musikJalan()); saatMusikBerubah(segarMusik);
  $$('.tab').forEach(t => t.addEventListener('click', (e) => {
    if (t.dataset.id === 'menu') { e.preventDefault(); bukaMenuDorong(); return; }
    if (t.getAttribute('href') !== location.hash) t.classList.add('memuat');
  }));
}

function bukaMenuDorong() {
  const s = sesi.staf, grup = {};
  for (const [id, h] of Object.entries(HALAMAN)) if (!h.tersembunyi && bolehBuka(id)) (grup[h.grup] ||= []).push(id);
  const kini = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'beranda';
  const tabMenu = $('.tab[data-id="menu"]');
  tabMenu?.classList.add('aktif');
  menuDorong({
    isiHTML: `<div class="zd-profil">${avatar(s, 'besar')}<div>${namaStaf(s)}<small>${esc(PERAN[s.peran])} · ${esc(s.kode)}</small></div></div>
      <div class="zd-daftar">${Object.entries(grup).map(([g, ids]) => `<div class="zd-grup">${g}</div>${ids.map(id => `<a href="#/${id}" class="zd-item ${id === kini ? 'on' : ''}">${ikon(HALAMAN[id].ik, 18)}<span>${esc(HALAMAN[id].pendek || HALAMAN[id].judul)}</span></a>`).join('')}`).join('')}</div>
      <div class="zd-bawah"><button class="btn kecil gelap" data-zd="kunci">${ikon('lock', 16)} Kunci</button><button class="btn kecil merah-garis" data-zd="keluar">${ikon('logout', 16)} Akhiri shift</button></div>`,
    saatTutup: () => { if (kini !== 'menu') tabMenu?.classList.remove('aktif'); },
  });
  const m = $('.zk-menu-dorong');
  $('[data-zd="kunci"]', m).onclick = () => setTimeout(kunciLayar, 300);
  $('[data-zd="keluar"]', m).onclick = () => setTimeout(() => $('[data-keluar]')?.click(), 300);
}

// ---------- notifikasi: stok menipis, retur menunggu, servis siap ----------
let notif = { stok: [], retur: [], siap: [] };
async function muatNotifikasi() {
  try {
    const [stok, retur, siap] = await Promise.all([
      api.ambil('v_stok_menipis', { select: 'id,nama,stok,batas', order: 'stok.asc', limit: 50 }),
      sesi.owner ? api.ambil('retur', { select: 'id,nomor,total', eq: { status: 'menunggu' } }) : [],
      api.ambil('servis', { select: 'id,nomor,nama', eq: { status: 'siap_diambil' } }),
    ]);
    notif = { stok, retur, siap };
    const n = stok.length + retur.length;
    const l = $('.lencana'); if (l) { l.hidden = !n; l.textContent = n > 99 ? '99+' : n; }
  } catch {}
}
function bukaNotifikasi() {
  const { stok, retur, siap } = notif;
  const l = lembar({ judul: 'Notifikasi', isi: `
    ${retur.length ? `<div class="notif-grup">${ikon('retur')} <b>${retur.length} retur menunggu persetujuan</b><a href="#/retur" class="btn kecil">Lihat</a></div>` : ''}
    ${siap.length ? `<div class="notif-grup hijau">${ikon('check')} <b>${siap.length} servis siap diambil</b><a href="#/servis" class="btn kecil">Lihat</a></div>` : ''}
    <h4 class="sub-judul">${ikon('alert', 16)} Stok hampir habis (${stok.length})</h4>
    ${stok.length ? `<div class="daftar-ringkas">${stok.map(s => `<div class="baris-ringkas"><span>${esc(s.nama)}</span><b class="${s.stok <= 0 ? 'merah' : 'kuning'}">${s.stok} / min ${s.batas}</b></div>`).join('')}</div>` : '<p class="redup">Semua stok aman 👍</p>'}
  ` });
  l.el.addEventListener('click', e => { if (e.target.closest('a')) l.tutup(); });
}

// ======================= ROUTER =======================
let halamanAktif = null, giliranTampil = 0;
async function tampilkan() {
  if (!sesi.staf) return;
  const giliran = ++giliranTampil;
  let id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'beranda';
  if (!HALAMAN[id] || !bolehBuka(id)) id = 'beranda';
  const h = HALAMAN[id];
  $$('.nav-item, .tab').forEach(a => a.classList.toggle('aktif', a.dataset.id === id));
  const judul = $('#judul-halaman'); if (judul) judul.textContent = h.judul;
  document.title = h.judul + ' — ZAMRUD KASIR';
  document.body.dataset.halaman = id;
  const wadah = $('#halaman');
  if (!wadah) return;
  try { halamanAktif?.lepas?.(); } catch {}
  try {
    document.body.classList.add('zk-pindah');
    clearTimeout(window.__pindahT);
    const adaIsi = wadah.childElementCount > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (adaIsi) { wadah.classList.remove('masuk'); wadah.classList.add('keluar'); }
    const [m] = await Promise.all([h.muat(), adaIsi ? new Promise(r => setTimeout(r, 120)) : null]); // halaman lama mengecil & memudar
    if (giliran !== giliranTampil) return;
    window.__gulirProgram = performance.now();
    window.scrollTo(0, 0);
    const ut = $('.utama'); if (ut) ut.scrollTop = 0;
    wadah.classList.remove('masuk', 'keluar');
    wadah.innerHTML = '';
    halamanAktif = m.default;
    // bagian awal halaman (kerangka) langsung tergambar, baru animasi zoom-blur dijalankan
    const proses = m.default.tampil(wadah, { params: new URLSearchParams(location.hash.split('?')[1] || ''), segarkanNotif: muatNotifikasi });
    void wadah.offsetWidth;
    wadah.classList.add('masuk');
    window.__pindahT = setTimeout(() => { document.body.classList.remove('zk-pindah'); }, 340);
    await proses;
    $$('.tab.memuat').forEach(t => t.classList.remove('memuat'));
    const ta = $(`.tab[data-id="${id}"]`);
    if (ta) { ta.classList.remove('sukses'); void ta.offsetWidth; ta.classList.add('sukses'); setTimeout(() => ta.classList.remove('sukses'), 900); }
  } catch (e) {
    if (giliran !== giliranTampil) return; // halaman sudah diganti
    console.error(e);
    wadah.innerHTML = `<div class="kosong">${ikon('alert', 40)}<p>${esc(e.message)}</p><button class="btn utama" onclick="location.reload()">Muat ulang</button></div>`;
  }
}
addEventListener('hashchange', tampilkan);

async function bukaAplikasi() {
  try { sesi.pengaturan = await api.satu('pengaturan'); } catch { sesi.pengaturan = {}; }
  // pastikan token masih berlaku
  try { await aksi('cek_sesi'); } catch { return; }
  kerangka();
  await tampilkan();
  muatNotifikasi();
  setTimeout(() => Object.values(HALAMAN).forEach(h => h.muat().catch(() => {})), 1500); // siapkan semua halaman agar cepat dibuka
  clearInterval(window.__notif); window.__notif = setInterval(muatNotifikasi, 60000);
}

// ======================= MULAI =======================
async function mulai() {
  if (!api.sudahMasuk) return layarLogin();
  let st;
  try {
    await api.rpc('daftarkan_akun_pertama');
    st = await api.rpc('status_aplikasi');
  } catch (e) {
    if (e.kode === 'OFFLINE') { akar.innerHTML = `<div class="layar-masuk"><div class="kartu-masuk"><h2>Tidak ada internet</h2><p class="sub">Periksa koneksi lalu coba lagi.</p><button class="btn utama penuh" onclick="location.reload()">Coba lagi</button></div></div>`; return; }
    await api.keluar(); return layarLogin(e.message);
  }
  if (!st.akun_sah) { await api.keluar(); return layarLogin('Akun ini tidak terdaftar sebagai akun toko Zamrud.'); }
  if (!st.ada_staf) return layarSetupOwner();
  if (!sesi.staf) return layarPin();
  return bukaAplikasi();
}

aturSaatSesiHabis((pesan) => layarPin(pesan));
aturSaatTerkunci(kunciLayar);
mulaiPemantauKunci();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

pembuka().then(mulai);
