import { sesi } from '../sesi.js';
import { esc, ikon, PERAN, $, avatar, namaStaf } from '../ui.js';
import { HALAMAN, bolehBuka } from '../app.js';

export default {
  async tampil(el) {
    const s = sesi.staf;
    const grup = {};
    for (const [id, h] of Object.entries(HALAMAN)) if (!h.tersembunyi && bolehBuka(id)) (grup[h.grup] ||= []).push([id, h]);
    el.innerHTML = `
      <section class="kartu-profil muncul">
        ${avatar(s, 'besar')}
        <div>${namaStaf(s)}<small>${esc(PERAN[s.peran])} · ${esc(s.kode)}</small></div>
        <button class="btn gelap kecil" id="kunci">${ikon('lock', 16)} Kunci</button>
      </section>
      ${Object.entries(grup).map(([g, d], gi) => `<div class="menu-grup muncul" style="--i:${gi}"><div class="lbl-kecil">${g}</div>
        <div class="menu-ios">${d.map(([id, h]) => `<a href="#/${id}" class="menu-baris"><span class="mi-ikon">${ikon(h.ik, 18)}</span><span>${esc(h.pendek || h.judul)}</span>${ikon('chevron', 16)}</a>`).join('')}</div></div>`).join('')}
      <button class="btn merah-garis penuh" id="akhiri">${ikon('logout', 18)} Akhiri shift</button>`;
    $('#kunci', el).onclick = () => document.querySelector('[data-kunci]')?.click();
    $('#akhiri', el).onclick = () => document.querySelector('[data-keluar]')?.click();
  },
};
