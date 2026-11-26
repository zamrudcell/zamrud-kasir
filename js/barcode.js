// Barcode Code128-B (tanpa library) + pemindai kamera
const POLA = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 ' +
  '111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 ' +
  '141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 ' +
  '124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 ' +
  '311141 411131 211412 211214 211232 2331112').split(' ');

// ---------- EAN-13 (dipakai untuk barcode buatan toko: awalan 20-29) ----------
const L = '0001101 0011001 0010011 0111101 0100011 0110001 0101111 0111011 0110111 0001011'.split(' ');
const G = '0100111 0110011 0011011 0100001 0011101 0111001 0000101 0010001 0001001 0010111'.split(' ');
const R = '1110010 1100110 1101100 1000010 1011100 1001110 1010000 1000100 1001000 1110100'.split(' ');
const PARITAS = 'LLLLLL LLGLGG LLGGLG LLGGGL LGLLGG LGGLLG LGGGLL LGLGLG LGLGGL LGGLGL'.split(' ');
export function cekEan13(k) {
  if (!/^\d{13}$/.test(k)) return false;
  let s = 0; for (let i = 0; i < 12; i++) s += Number(k[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(k[12]);
}
function ean13SVG(k, tinggi, modul, tampilTeks) {
  const par = PARITAS[Number(k[0])];
  let bit = '101';
  for (let i = 1; i <= 6; i++) bit += (par[i - 1] === 'L' ? L : G)[Number(k[i])];
  bit += '01010';
  for (let i = 7; i <= 12; i++) bit += R[Number(k[i])];
  bit += '101';
  const tepi = 11 * modul;
  let batang = '';
  const panjang = (i) => (i < 3 || (i >= 45 && i < 50) || i >= 92) ? tinggi + 6 : tinggi;
  for (let i = 0; i < bit.length; i++) if (bit[i] === '1') batang += `<rect x="${tepi + i * modul}" y="0" width="${modul}" height="${panjang(i)}"/>`;
  const lebar = tepi * 2 + bit.length * modul, tt = tinggi + (tampilTeks ? 18 : 6);
  const teks = tampilTeks ? `<g font-family="monospace" font-size="${6 * modul}" text-anchor="middle">
      <text x="${tepi - 4 * modul}" y="${tinggi + 14}">${k[0]}</text>
      <text x="${tepi + 24 * modul}" y="${tinggi + 14}">${k.slice(1, 7)}</text>
      <text x="${tepi + 71 * modul}" y="${tinggi + 14}">${k.slice(7)}</text></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tt}" width="${lebar}" height="${tt}" class="barcode">
    <rect width="${lebar}" height="${tt}" fill="#fff"/><g fill="#000">${batang}</g>${teks}</svg>`;
}

export function barcodeSVG(teks, { tinggi = 50, modul = 2, tampilTeks = true } = {}) {
  teks = String(teks || '').replace(/[^\x20-\x7e]/g, '');
  if (cekEan13(teks)) return ean13SVG(teks, tinggi, modul, tampilTeks);
  const nilai = [104];
  for (const c of teks) nilai.push(c.charCodeAt(0) - 32);
  let cek = 104;
  for (let i = 1; i < nilai.length; i++) cek += nilai[i] * i;
  nilai.push(cek % 103, 106);
  let x = 10 * modul, batang = '';
  for (const v of nilai) {
    const p = POLA[v];
    for (let i = 0; i < p.length; i++) {
      const w = Number(p[i]) * modul;
      if (i % 2 === 0) batang += `<rect x="${x}" y="0" width="${w}" height="${tinggi}"/>`;
      x += w;
    }
  }
  const lebar = x + 10 * modul;
  const tinggiTotal = tinggi + (tampilTeks ? 16 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tinggiTotal}" width="${lebar}" height="${tinggiTotal}" class="barcode">
    <rect width="${lebar}" height="${tinggiTotal}" fill="#fff"/><g fill="#000">${batang}</g>
    ${tampilTeks ? `<text x="${lebar / 2}" y="${tinggi + 13}" text-anchor="middle" font-family="monospace" font-size="12">${teks}</text>` : ''}</svg>`;
}

// ---------- pemindai kamera ----------
let zxingJanji = null;
function muatZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingJanji) zxingJanji = new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    s.onload = () => ok(window.ZXing); s.onerror = () => { zxingJanji = null; gagal(new Error('Gagal memuat pemindai')); };
    document.head.appendChild(s);
  });
  return zxingJanji;
}

// buka kamera di elemen <video>, panggil saatDapat(kode). Kembalikan fungsi berhenti.
export async function mulaiPindai(video, saatDapat) {
  let berhenti = false, stream = null, pembaca = null, terakhir = '';
  const kirim = (k) => { if (!k || berhenti || k === terakhir) return; terakhir = k; saatDapat(k); setTimeout(() => { terakhir = ''; }, 1500); };
  if ('BarcodeDetector' in window) {
    const det = new window.BarcodeDetector();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream; video.setAttribute('playsinline', ''); await video.play();
    const putar = async () => {
      if (berhenti) return;
      try { const h = await det.detect(video); if (h[0]) kirim(h[0].rawValue); } catch {}
      setTimeout(putar, 180);
    };
    putar();
  } else {
    const Z = await muatZxing();
    pembaca = new Z.BrowserMultiFormatReader();
    await pembaca.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (hasil) => { if (hasil) kirim(hasil.getText()); });
  }
  return () => {
    berhenti = true;
    try { pembaca && pembaca.reset(); } catch {}
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
    try { video.srcObject && video.srcObject.getTracks && video.srcObject.getTracks().forEach(t => t.stop()); } catch {}
  };
}
