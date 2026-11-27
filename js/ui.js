// Alat bantu tampilan: format, ikon, toast, lembar (sheet), konfirmasi, animasi angka
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
export const angka = (n) => (Number(n) || 0).toLocaleString('id-ID');
export const ZONA = 'Asia/Makassar';

export function tgl(d, jam = true) {
  if (!d) return '-';
  const x = new Date(d);
  const o = { day: '2-digit', month: 'short', year: 'numeric', timeZone: ZONA };
  if (jam) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return x.toLocaleString('id-ID', o);
}
export function hariIni() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA }); // YYYY-MM-DD
}
export function geserHari(isoTgl, n) {
  const d = new Date(isoTgl + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}
// batas awal & akhir hari (WITA) dalam ISO untuk filter tanggal timestamptz
export const awalHari = (t) => t + 'T00:00:00+08:00';
export const akhirHari = (t) => t + 'T23:59:59.999+08:00';

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  kasir: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M7 10V5h7v5M7 14h2M11 14h2M15 14h2M7 17h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  menu: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  retur: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4M12 17v.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  filter: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z"/>',
  star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
export const ikon = (n, ukuran = 20) =>
  `<svg class="ik" width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- toast ----------
export function toast(pesan, jenis = 'ok') {
  let w = $('#toasts');
  if (!w) { w = document.createElement('div'); w.id = 'toasts'; document.body.appendChild(w); }
  const t = document.createElement('div');
  t.className = 'toast ' + jenis;
  t.innerHTML = `${ikon(jenis === 'ok' ? 'check' : jenis === 'err' ? 'alert' : 'bell', 18)}<span>${esc(pesan)}</span>`;
  w.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, jenis === 'err' ? 4200 : 2600);
}
export const salah = (e) => toast(e?.message || String(e), 'err');

// ---------- lembar (bottom sheet di HP, dialog di komputer) ----------
export function lembar({ judul, isi, lebar = 520, tutupLuar = true }) {
  const lapis = document.createElement('div');
  lapis.className = 'lapis';
  lapis.innerHTML = `<div class="lembar" style="--lebar:${lebar}px" role="dialog" aria-modal="true">
      <div class="lembar-pegangan"></div>
      <div class="lembar-kepala"><h3>${esc(judul)}</h3><button class="btn-ikon tutup" aria-label="Tutup">${ikon('x')}</button></div>
      <div class="lembar-isi"></div></div>`;
  const badan = $('.lembar-isi', lapis);
  if (typeof isi === 'string') badan.innerHTML = isi; else if (isi) badan.appendChild(isi);
  document.body.appendChild(lapis);
  document.body.classList.add('ada-lembar');
  requestAnimationFrame(() => lapis.classList.add('on'));
  let selesai;
  const janji = new Promise(r => (selesai = r));
  const tutup = (hasil) => {
    lapis.classList.remove('on');
    setTimeout(() => { lapis.remove(); if (!$('.lapis')) document.body.classList.remove('ada-lembar'); }, 320);
    selesai(hasil);
  };
  $('.tutup', lapis).onclick = () => tutup(null);
  if (tutupLuar) lapis.addEventListener('click', e => { if (e.target === lapis) tutup(null); });
  return { el: badan, tutup, janji, akar: lapis };
}

export function konfirmasi(pesan, { ya = 'Ya', bahaya = false, judul = 'Konfirmasi' } = {}) {
  const l = lembar({ judul, lebar: 420, isi: `<p class="teks-konfirm">${esc(pesan)}</p>
    <div class="baris-tombol"><button class="btn abu" data-x>Batal</button><button class="btn ${bahaya ? 'merah' : 'utama'}" data-ya>${esc(ya)}</button></div>` });
  $('[data-x]', l.el).onclick = () => l.tutup(false);
  $('[data-ya]', l.el).onclick = () => l.tutup(true);
  return l.janji.then(v => !!v);
}

export function tanya(pesan, { judul = 'Isi', placeholder = '', nilai = '', tipe = 'text', ya = 'Simpan' } = {}) {
  const l = lembar({ judul, lebar: 420, isi: `<p class="teks-konfirm">${esc(pesan)}</p>
    <input class="input" type="${tipe}" placeholder="${esc(placeholder)}" value="${esc(nilai)}">
    <div class="baris-tombol"><button class="btn abu" data-x>Batal</button><button class="btn utama" data-ya>${esc(ya)}</button></div>` });
  const inp = $('input', l.el); setTimeout(() => inp.focus(), 300);
  $('[data-x]', l.el).onclick = () => l.tutup(null);
  $('[data-ya]', l.el).onclick = () => l.tutup(inp.value);
  inp.onkeydown = e => { if (e.key === 'Enter') l.tutup(inp.value); };
  return l.janji;
}

// ---------- animasi ----------
export function hitungNaik(el, ke, { durasi = 900, format = angka } = {}) {
  const dari = 0, mulai = performance.now();
  const kurva = t => 1 - Math.pow(1 - t, 3);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = format(ke); return; }
  const langkah = (s) => {
    const t = Math.min(1, (s - mulai) / durasi);
    el.textContent = format(dari + (ke - dari) * kurva(t));
    if (t < 1) requestAnimationFrame(langkah);
  };
  requestAnimationFrame(langkah);
}
export function animasiAngka(akar) {
  $$('[data-hitung]', akar).forEach(el => {
    const v = Number(el.dataset.hitung) || 0;
    hitungNaik(el, v, { format: el.dataset.rp !== undefined ? rp : angka });
  });
}

export function kosong(teks, ik = 'box') {
  return `<div class="kosong">${ikon(ik, 40)}<p>${esc(teks)}</p></div>`;
}
export const memuat = () => `<div class="memuat"><span></span><span></span><span></span></div>`;

// tombol sibuk
export async function sibuk(btn, fn) {
  if (btn.disabled) return;
  const asli = btn.innerHTML; btn.disabled = true; btn.classList.add('sibuk');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('sibuk'); btn.innerHTML = asli; }
}

export const STATUS_SERVIS = {
  antri: { label: 'Antri', warna: 'abu', ik: 'clock' },
  dikerjakan: { label: 'Dikerjakan', warna: 'biru', ik: 'tool' },
  tunggu_sparepart: { label: 'Tunggu Sparepart', warna: 'kuning', ik: 'box' },
  siap_diambil: { label: 'Siap Diambil', warna: 'hijau', ik: 'check' },
  diambil: { label: 'Diambil', warna: 'ungu', ik: 'user' },
  batal: { label: 'Batal', warna: 'merah', ik: 'x' },
};
export const PERAN = { owner: 'Owner', kasir: 'Kasir', teknisi: 'Teknisi' };
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// avatar: owner memakai logo permata dengan cincin emas-hijau-perak
export function avatar(s, kelas = '') {
  if (s && s.peran === 'owner') return `<span class="avatar avatar-owner ${kelas}"><img src="assets/gem.png" alt=""></span>`;
  return `<span class="avatar ${kelas}" style="--w:${esc(s?.warna || '#10b981')}">${esc(((s && s.nama) || '?')[0])}</span>`;
}
export const namaStaf = (s) => s && s.peran === 'owner' ? `<b class="nama-owner">${esc(s.nama)}</b>` : `<b>${esc(s?.nama || '')}</b>`;
