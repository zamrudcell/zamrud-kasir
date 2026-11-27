// Efek ZAMRUD KASIR: nada UI, jeli memantul, transisi cairan, saklar titik LED logo Zamrud, tema
// ---------------- pengaturan perangkat ----------------
const ambil = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const simpan = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const tema = () => ambil('zk_tema', 'kaca');
export const suaraNyala = () => ambil('zk_suara', '1') === '1';
export function setTema(t) { simpan('zk_tema', t); terapkanTema(); }
export function setSuara(on) { simpan('zk_suara', on ? '1' : '0'); }
export function terapkanTema() {
  document.body.classList.toggle('tema-kaca', tema() === 'kaca');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema() === 'kaca' ? '#070b16' : '#063826');
}
const geraknya = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- Nada UI (Web Audio API, tanpa file suara) ----------------
let _ac;
const audio = () => { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === 'suspended') _ac.resume(); return _ac; };
function nada({ f = 440, f2 = f, d = .12, type = 'sine', v = .2, a = .005 }) {
  const c = audio(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .03);
}
function desis({ d = .3, f = 1200, f2 = f, q = 1, v = .2 }) {
  const c = audio(), t = c.currentTime, n = c.sampleRate * d | 0, buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; flt.type = 'bandpass'; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t); flt.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + d * .3); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(flt).connect(g).connect(c.destination); s.start(t);
}
const NADA_UI = {
  tick: () => nada({ f: 1800, f2: 900, d: .04, type: 'triangle', v: .15 }),
  boing: () => nada({ f: 130, f2: 430, d: .24, v: .22 }),
  drop: () => nada({ f: 980, f2: 320, d: .18, v: .18 }),
  gloop: () => { nada({ f: 160, f2: 520, d: .3, v: .22 }); desis({ d: .35, f: 400, f2: 1200, q: 2, v: .08 }); },
  chime: () => { nada({ f: 880, d: .5, v: .14 }); setTimeout(() => nada({ f: 1320, d: .6, v: .12 }), 90); },
  shimmer: () => [0, 1, 2, 3].forEach(i => setTimeout(() => nada({ f: 1200 + i * 320, d: .22, v: .07 }), i * 45)),
};
export function sfx(nama) { if (!suaraNyala()) return; try { NADA_UI[nama] && NADA_UI[nama](); } catch (err) {} }

// ---------------- 1. Jeli memantul saat kotak disentuh ----------------
const JELI_KARTU = '.stat, .kotak-status, .kartu-produk, .aksi, .kartu-staf-besar, .kartu-profil';
const JELI_BARIS = '.menu-baris, .baris-servis, .baris-daftar, .baris-promo, .nav-item, .tab:not(.tengah)';
function goyang(el, halus) {
  el.classList.remove('muncul', 'zk-jeli', 'zk-jeli-halus'); void el.offsetWidth;
  el.classList.add(halus ? 'zk-jeli-halus' : 'zk-jeli');
  if (!halus) sfx('boing');
}
document.addEventListener('pointerdown', (e) => {
  if (!geraknya()) return;
  const k = e.target.closest(JELI_KARTU);
  if (k && !k.disabled) return goyang(k, false);
  const b = e.target.closest(JELI_BARIS);
  if (b) goyang(b, true);
}, { passive: true });
document.addEventListener('animationend', (e) => {
  if (e.animationName === 'zk-jeli' || e.animationName === 'zk-jeli-halus') e.target.classList.remove('zk-jeli', 'zk-jeli-halus');
});

// ---------------- 2. Transisi cairan saat membuka kotak/halaman ----------------
let lapisCair = null, sibukCair = false;
function siapkanCair() {
  if (lapisCair) return lapisCair;
  const ns = 'http://www.w3.org/2000/svg';
  lapisCair = document.createElementNS(ns, 'svg');
  lapisCair.setAttribute('class', 'zk-cair'); lapisCair.setAttribute('viewBox', '0 0 100 100');
  lapisCair.setAttribute('preserveAspectRatio', 'none'); lapisCair.setAttribute('aria-hidden', 'true');
  lapisCair.innerHTML = `<defs><linearGradient id="zk-cair-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e7a55"/><stop offset=".55" stop-color="#063826"/><stop offset="1" stop-color="#c9a24a"/></linearGradient></defs>
    <path fill="url(#zk-cair-g)" d="M0,100 L100,100 Z"/>`;
  document.body.appendChild(lapisCair);
  return lapisCair;
}
const halus = t => t * t * (3 - 2 * t);
function animasi(durasi, gambar) {
  return new Promise(ok => {
    const awal = performance.now();
    (function f(now) { const p = Math.min(1, (now - awal) / durasi); gambar(halus(p)); p < 1 ? requestAnimationFrame(f) : ok(); })(awal);
  });
}
export async function transisiCair(saatTertutup) {
  if (!geraknya() || sibukCair) { saatTertutup(); return; }
  sibukCair = true;
  const svg = siapkanCair(), path = svg.querySelector('path'), LENTUR = 60;
  svg.style.display = 'block';
  sfx('gloop');
  await animasi(420, p => { const y = 100 - p * 130, b = Math.sin(p * Math.PI) * LENTUR;
    path.setAttribute('d', `M0,100 L0,${y} Q50,${y - b} 100,${y} L100,100 Z`); });
  try { saatTertutup(); } catch {}
  await new Promise(r => setTimeout(r, 140));
  sfx('drop');
  await animasi(480, p => { const y = 100 - p * 130, b = Math.sin(p * Math.PI) * LENTUR;
    path.setAttribute('d', `M0,0 L0,${y} Q50,${y - b} 100,${y} L100,0 Z`); });
  path.setAttribute('d', 'M0,100 L100,100 Z'); svg.style.display = 'none';
  sibukCair = false;
}
// semua tautan menu/kotak (#/halaman) memakai transisi cairan
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.button) return;
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  const ke = a.getAttribute('href');
  if (ke === location.hash) return;
  e.preventDefault();
  setTimeout(() => transisiCair(() => { location.hash = ke; }), 120); // beri waktu efek jeli terlihat
});

// ---------------- 3. Saklar titik LED → logo permata Zamrud ----------------
const pola = rows => rows.flatMap((r, y) => [...r].map((c, x) => c === '#' ? [x - 5, y - 5] : null).filter(Boolean));
const GEMBOK = pola(['...........', '....###....', '...#...#...', '...#...#...', '..#######..', '..#######..', '..###.###..', '..###.###..', '..#######..', '..#######..', '...........']);
const KILAU = pola(['.....#.....', '.....#.....', '..#..#..#..', '...#.#.#...', '....###....', '###########', '....###....', '...#.#.#...', '..#..#..#..', '.....#.....', '.....#.....']);
const PERMATA = pola(['...#####...', '..#.....#..', '.#.#####.#.', '#.#.....#.#', '#.#.....#.#', '#.#.#.#.#.#', '#.#.#.#.#.#', '#.#.#.#.#.#', '.#.#####.#.', '..#.....#..', '...#####...']);
const N = Math.max(GEMBOK.length, KILAU.length, PERMATA.length);

export function saklarLogo({ label = 'Ketuk untuk masuk', saatTekan }) {
  const wadah = document.createElement('div');
  wadah.className = 'zk-saklar-wadah';
  wadah.innerHTML = `<button type="button" class="zk-saklar" role="switch" aria-checked="false" aria-label="${label}"><canvas></canvas></button><p class="zk-saklar-ket">${label}</p>`;
  const tombol = wadah.querySelector('.zk-saklar'), cv = tombol.querySelector('canvas'), g = cv.getContext('2d'), ket = wadah.querySelector('.zk-saklar-ket');
  const cl = v => Math.max(0, Math.min(1, v)), lerp = (a, b, k) => a + (b - a) * k;
  const io = x => (x = cl(x), x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const campur = (a, b, k) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * cl(k))).join(',')})`; };
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const SEBAR = Array.from({ length: N }, () => [rnd() * 2 - 1, rnd() * 2 - 1]);
  const pil = (W, H) => { const r = H / 2; g.beginPath(); g.moveTo(r, 0); g.lineTo(W - r, 0); g.arc(W - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, H); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
  function gambar(W, H, p, t) {
    const e = io(p);
    g.fillStyle = e < .5 ? campur('#0b1220', '#0a3a2a', e * 2) : campur('#0a3a2a', '#0e7a55', (e - .5) * 2); g.fillRect(0, 0, W, H);
    // kilau kaca bergerak
    const kx = ((t * 60) % (W * 2)) - W * .5, kl = g.createLinearGradient(kx, 0, kx + W * .4, H);
    kl.addColorStop(0, 'rgba(255,255,255,0)'); kl.addColorStop(.5, 'rgba(255,255,255,.07)'); kl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = kl; g.fillRect(0, 0, W, H);
    const R = H * .4, cx = lerp(H / 2, W - H / 2, e), cy = H / 2;
    const cincin = e < .5 ? campur('#64748b', '#f6c453', e * 2) : campur('#f6c453', '#6ee7b7', (e - .5) * 2);
    g.save(); g.shadowColor = cincin; g.shadowBlur = 24;
    g.fillStyle = e > .55 ? campur('#0f1b2d', '#04140e', (e - .55) / .45) : 'rgba(255,255,255,.07)';
    g.beginPath(); g.arc(cx, cy, R, 0, 6.283); g.fill(); g.strokeStyle = cincin; g.lineWidth = 2; g.stroke(); g.restore();
    const sel = R * 1.25 / 11, seg = e < .5 ? 0 : 1, f = e < .5 ? e * 2 : (e - .5) * 2, A = seg ? KILAU : GEMBOK, B = seg ? PERMATA : KILAU;
    const sebar = Math.sin(Math.PI * f) * R * .55;
    g.fillStyle = e < .5 ? campur('#94a3b8', '#f6c453', e * 2) : campur('#f6c453', '#6ee7b7', (e - .5) * 2);
    for (let i = 0; i < N; i++) {
      const a = A[i % A.length], b = B[i % B.length];
      const x = cx + lerp(a[0], b[0], io(f)) * sel + SEBAR[i][0] * sebar, y = cy + lerp(a[1], b[1], io(f)) * sel + SEBAR[i][1] * sebar;
      g.globalAlpha = .55 + .45 * Math.abs(Math.sin(t * 2 + i)); g.beginPath(); g.arc(x, y, sel * .34, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
    // tulisan samping
    g.font = `700 ${Math.round(H * .17)}px -apple-system, system-ui, sans-serif`; g.textBaseline = 'middle';
    g.fillStyle = `rgba(255,255,255,${.85 * (1 - e)})`; g.textAlign = 'right';
    g.fillText('MASUK  ›', W - H * .42, cy);
    g.fillStyle = `rgba(232,211,160,${e})`; g.textAlign = 'left';
    g.fillText('ZAMRUD', H * .42, cy);
  }
  const DURASI = 1.6;
  let nyala = false, p = 0, dari = 0, mulai = -1e9, jalan = true, W = 0, H = 0;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const atur = (on) => {
    nyala = on; dari = p; mulai = performance.now();
    tombol.setAttribute('aria-checked', on); tombol.classList.toggle('nyala', on);
    if (on) { sfx('shimmer'); setTimeout(() => nyala && sfx('chime'), 900); } else sfx('tick');
  };
  tombol.addEventListener('click', () => { if (!nyala) saatTekan?.(); });
  (function bingkai(now) {
    if (!jalan) return;
    if (!wadah.isConnected && W) { jalan = false; return; }
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w && (w !== W || h !== H)) { W = w; H = h; cv.width = w * dpr; cv.height = h * dpr; }
    if (W) {
      const k = cl((now - mulai) / (DURASI * 1000));
      p = lerp(dari, nyala ? 1 : 0, k);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.save(); pil(W, H); g.clip(); gambar(W, H, p, now / 1000);
      const bayang = g.createLinearGradient(0, 0, 0, H * .3); bayang.addColorStop(0, 'rgba(0,0,0,.3)'); bayang.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bayang; g.fillRect(0, 0, W, H * .3); g.restore();
    }
    requestAnimationFrame(bingkai);
  })(performance.now());
  return {
    el: wadah,
    nyalakan: () => { atur(true); ket.textContent = 'Membuka…'; },
    matikan: () => { atur(false); ket.textContent = label; },
    selesai: () => new Promise(r => setTimeout(r, DURASI * 1000 + 100)),
  };
}
