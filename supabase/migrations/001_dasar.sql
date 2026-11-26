-- =====================================================================
-- ZAMRUD KASIR — Migrasi 001: struktur dasar database
-- Aman dijalankan ulang (idempotent). Jalankan di Supabase > SQL Editor.
--
-- PRINSIP KEAMANAN (anti-manipulasi):
--   * Aplikasi TIDAK BISA menulis langsung ke tabel. Semua perubahan lewat
--     fungsi (RPC) yang mewajibkan token sesi karyawan (login kode + PIN).
--   * Nama karyawan di setiap transaksi diambil dari sesi di server,
--     bukan dari aplikasi -> si B tidak bisa mencatat atas nama si A.
--   * Karyawan hanya bisa login & bekerja di jam shift yang diatur owner.
--   * Harga diambil dari server, kasir tidak bisa mengubah harga.
--   * Batal transaksi & retur wajib disetujui owner. Semua tercatat di log.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. AKUN TOKO (akun email yang boleh membuka aplikasi)
-- ---------------------------------------------------------------------
create table if not exists akun_toko (
  user_id uuid primary key,
  email text,
  dibuat timestamptz not null default now()
);

create or replace function _akun_sah() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from akun_toko where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. PENGATURAN TOKO (1 baris)
-- ---------------------------------------------------------------------
create table if not exists pengaturan (
  id int primary key default 1 check (id = 1),
  nama_toko text not null default 'ZAMRUD CELL',
  alamat text default '',
  telepon text default '',
  catatan_nota text default 'Terima kasih telah berbelanja di Zamrud Cell',
  syarat_garansi text default 'Garansi berlaku dengan menunjukkan nota ini. Garansi tidak berlaku untuk kerusakan karena jatuh, terkena air, atau segel rusak.',
  garansi_jual_hari int not null default 7,
  garansi_servis_hari int not null default 30,
  stok_minimum_default int not null default 3,
  zona_waktu text not null default 'Asia/Makassar',
  menit_kunci int not null default 2,
  diubah timestamptz default now()
);
insert into pengaturan (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. KARYAWAN, PIN, JADWAL SHIFT, SESI
-- ---------------------------------------------------------------------
create table if not exists staf (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  nama text not null,
  peran text not null default 'kasir' check (peran in ('owner','kasir','teknisi')),
  hp text default '',
  aktif boolean not null default true,
  bebas_jadwal boolean not null default false,
  warna text default '#10b981',
  dibuat timestamptz not null default now()
);

-- PIN disimpan terpisah (hash), TIDAK bisa dibaca aplikasi
create table if not exists staf_pin (
  staf_id uuid primary key references staf(id) on delete cascade,
  pin_hash text not null,
  gagal int not null default 0,
  kunci_sampai timestamptz
);

create table if not exists jadwal_shift (
  id uuid primary key default gen_random_uuid(),
  staf_id uuid not null references staf(id) on delete cascade,
  hari int not null check (hari between 0 and 6),  -- 0 = Minggu
  jam_mulai time not null,
  jam_selesai time not null,
  nama_shift text default ''
);
create index if not exists jadwal_shift_staf on jadwal_shift(staf_id);

create table if not exists staf_sesi (
  token uuid primary key default gen_random_uuid(),
  staf_id uuid not null references staf(id) on delete cascade,
  user_id uuid,
  mulai timestamptz not null default now(),
  terakhir timestamptz not null default now(),
  selesai timestamptz
);
create index if not exists staf_sesi_staf on staf_sesi(staf_id);

-- ---------------------------------------------------------------------
-- 4. PRODUK, KATEGORI, STOK
-- ---------------------------------------------------------------------
create table if not exists kategori (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  dibuat timestamptz not null default now()
);

create table if not exists produk (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  barcode text unique,
  nama text not null,
  kategori_id uuid references kategori(id) on delete set null,
  harga_beli numeric(14,0) not null default 0,
  harga_jual numeric(14,0) not null default 0,
  stok int not null default 0,
  stok_minimum int,
  satuan text not null default 'pcs',
  garansi_hari int,
  aktif boolean not null default true,
  dibuat timestamptz not null default now(),
  diubah timestamptz not null default now()
);
create index if not exists produk_nama on produk(lower(nama));

create table if not exists stok_mutasi (
  id bigserial primary key,
  produk_id uuid not null references produk(id) on delete cascade,
  jenis text not null, -- jual, batal_jual, servis, retur, opname, masuk, koreksi, promo
  qty int not null,     -- + masuk, - keluar
  stok_akhir int not null,
  ref text,
  staf_id uuid references staf(id),
  dibuat timestamptz not null default now()
);
create index if not exists stok_mutasi_produk on stok_mutasi(produk_id, dibuat desc);

create table if not exists harga_log (
  id bigserial primary key,
  produk_id uuid not null references produk(id) on delete cascade,
  beli_lama numeric(14,0), beli_baru numeric(14,0),
  jual_lama numeric(14,0), jual_baru numeric(14,0),
  staf_id uuid references staf(id),
  dibuat timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. PELANGGAN
-- ---------------------------------------------------------------------
create table if not exists pelanggan (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  hp text,
  alamat text default '',
  catatan text default '',
  dibuat timestamptz not null default now()
);
create unique index if not exists pelanggan_hp on pelanggan(hp) where hp is not null and hp <> '';

-- ---------------------------------------------------------------------
-- 6. PROMO (harga khusus & barang gratis) — diatur owner
-- ---------------------------------------------------------------------
create table if not exists promo (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jenis text not null check (jenis in ('diskon_persen','diskon_nominal','gratis')),
  -- syarat
  syarat text not null check (syarat in ('produk','kategori','min_belanja','servis')),
  syarat_produk_id uuid references produk(id) on delete cascade,
  syarat_kategori_id uuid references kategori(id) on delete cascade,
  syarat_kata_servis text,          -- contoh: 'LCD' -> servis yang jenisnya mengandung LCD
  min_qty int not null default 1,
  min_belanja numeric(14,0) not null default 0,
  -- hasil
  nilai numeric(14,2) not null default 0,  -- persen / nominal per unit
  hadiah_produk_id uuid references produk(id) on delete cascade,
  hadiah_qty int not null default 1,
  mulai date,
  selesai date,
  aktif boolean not null default true,
  dibuat timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. TRANSAKSI PENJUALAN
-- ---------------------------------------------------------------------
create table if not exists nomor_urut (
  awalan text not null,
  tanggal date not null,
  n int not null default 0,
  primary key (awalan, tanggal)
);

create table if not exists transaksi (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  staf_id uuid not null references staf(id),
  pelanggan_id uuid references pelanggan(id),
  subtotal numeric(14,0) not null default 0,
  diskon numeric(14,0) not null default 0,
  total numeric(14,0) not null default 0,
  modal numeric(14,0) not null default 0,
  bayar numeric(14,0) not null default 0,
  kembali numeric(14,0) not null default 0,
  metode text not null default 'tunai' check (metode in ('tunai','transfer','qris')),
  catatan text default '',
  status text not null default 'selesai' check (status in ('selesai','batal')),
  batal_oleh uuid references staf(id),
  batal_alasan text,
  batal_waktu timestamptz,
  dibuat timestamptz not null default now()
);
create index if not exists transaksi_waktu on transaksi(dibuat desc);
create index if not exists transaksi_staf on transaksi(staf_id, dibuat desc);

create table if not exists transaksi_item (
  id uuid primary key default gen_random_uuid(),
  transaksi_id uuid not null references transaksi(id) on delete cascade,
  produk_id uuid references produk(id),
  nama text not null,
  qty int not null check (qty > 0),
  harga numeric(14,0) not null,
  harga_beli numeric(14,0) not null default 0,
  diskon numeric(14,0) not null default 0,   -- total diskon baris
  subtotal numeric(14,0) not null,
  gratis boolean not null default false,
  promo_id uuid references promo(id) on delete set null,
  garansi_hari int not null default 0,
  qty_retur int not null default 0
);
create index if not exists transaksi_item_trx on transaksi_item(transaksi_id);

-- ---------------------------------------------------------------------
-- 8. RETUR (wajib disetujui owner)
-- ---------------------------------------------------------------------
create table if not exists retur (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  transaksi_id uuid not null references transaksi(id),
  staf_id uuid not null references staf(id),
  alasan text not null,
  tindakan text not null default 'uang_kembali' check (tindakan in ('uang_kembali','tukar_barang')),
  total numeric(14,0) not null default 0,
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak')),
  diputus_oleh uuid references staf(id),
  diputus_waktu timestamptz,
  dibuat timestamptz not null default now()
);

create table if not exists retur_item (
  id uuid primary key default gen_random_uuid(),
  retur_id uuid not null references retur(id) on delete cascade,
  transaksi_item_id uuid not null references transaksi_item(id),
  produk_id uuid references produk(id),
  qty int not null check (qty > 0),
  nominal numeric(14,0) not null,
  kembali_stok boolean not null default true  -- false = barang rusak, tidak masuk stok
);

-- ---------------------------------------------------------------------
-- 9. SERVIS
-- ---------------------------------------------------------------------
create table if not exists servis (
  id uuid primary key default gen_random_uuid(),
  nomor text not null unique,
  pelanggan_id uuid references pelanggan(id),
  nama text not null,
  hp text default '',
  merek text default '',
  tipe text default '',
  imei text default '',
  jenis_servis text default '',
  keluhan text default '',
  kelengkapan text default '',
  kondisi text default '',
  sandi_hp text default '',
  estimasi_biaya numeric(14,0) not null default 0,
  biaya_jasa numeric(14,0) not null default 0,
  status text not null default 'antri'
    check (status in ('antri','dikerjakan','tunggu_sparepart','siap_diambil','diambil','batal')),
  staf_terima_id uuid not null references staf(id),
  teknisi_id uuid references staf(id),
  garansi_hari int not null default 30,
  catatan text default '',
  dibuat timestamptz not null default now(),
  selesai_waktu timestamptz,
  diambil_waktu timestamptz,
  diambil_oleh uuid references staf(id)
);
create index if not exists servis_status on servis(status, dibuat desc);
create index if not exists servis_imei on servis(imei);

create table if not exists servis_sparepart (
  id uuid primary key default gen_random_uuid(),
  servis_id uuid not null references servis(id) on delete cascade,
  produk_id uuid references produk(id),
  nama text not null,
  qty int not null check (qty > 0),
  harga numeric(14,0) not null,
  harga_beli numeric(14,0) not null default 0,
  gratis boolean not null default false,
  promo_id uuid references promo(id) on delete set null,
  staf_id uuid references staf(id),
  dibuat timestamptz not null default now()
);

create table if not exists servis_bayar (
  id uuid primary key default gen_random_uuid(),
  servis_id uuid not null references servis(id) on delete cascade,
  nominal numeric(14,0) not null check (nominal > 0),
  metode text not null default 'tunai' check (metode in ('tunai','transfer','qris')),
  jenis text not null default 'pelunasan' check (jenis in ('dp','pelunasan')),
  staf_id uuid not null references staf(id),
  dibuat timestamptz not null default now()
);

create table if not exists servis_log (
  id bigserial primary key,
  servis_id uuid not null references servis(id) on delete cascade,
  status text not null,
  catatan text default '',
  staf_id uuid references staf(id),
  dibuat timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. STOK OPNAME
-- ---------------------------------------------------------------------
create table if not exists opname (
  id uuid primary key default gen_random_uuid(),
  keterangan text not null default '',
  status text not null default 'draf' check (status in ('draf','final','batal')),
  staf_id uuid not null references staf(id),
  final_oleh uuid references staf(id),
  final_waktu timestamptz,
  dibuat timestamptz not null default now()
);

create table if not exists opname_item (
  opname_id uuid not null references opname(id) on delete cascade,
  produk_id uuid not null references produk(id) on delete cascade,
  stok_sistem int not null,
  stok_fisik int,
  harga_beli numeric(14,0) not null default 0,
  diisi_oleh uuid references staf(id),
  diisi_waktu timestamptz,
  primary key (opname_id, produk_id)
);

-- ---------------------------------------------------------------------
-- 11. TUGAS SHIFT & BONUS
-- ---------------------------------------------------------------------
create table if not exists tugas (
  id uuid primary key default gen_random_uuid(),
  staf_id uuid not null references staf(id) on delete cascade,
  tanggal date not null,
  judul text not null,
  keterangan text default '',
  bonus numeric(14,0) not null default 0,
  status text not null default 'baru' check (status in ('baru','selesai','disetujui','ditolak')),
  selesai_waktu timestamptz,
  dibuat_oleh uuid references staf(id),
  dibuat timestamptz not null default now()
);
create index if not exists tugas_staf on tugas(staf_id, tanggal);

create table if not exists bonus_aturan (
  id uuid primary key default gen_random_uuid(),
  peran text check (peran in ('kasir','teknisi')),   -- null = semua
  staf_id uuid references staf(id) on delete cascade, -- null = semua staf peran itu
  jenis text not null check (jenis in ('per_transaksi','persen_penjualan','per_servis','persen_jasa_servis')),
  nilai numeric(14,2) not null default 0,
  aktif boolean not null default true,
  dibuat timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 12. PENGELUARAN (untuk laba rugi) & LOG AKTIVITAS
-- ---------------------------------------------------------------------
create table if not exists pengeluaran (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null default current_date,
  keterangan text not null,
  nominal numeric(14,0) not null check (nominal > 0),
  staf_id uuid not null references staf(id),
  dibuat timestamptz not null default now()
);

create table if not exists log_aktivitas (
  id bigserial primary key,
  staf_id uuid references staf(id),
  aksi text not null,
  detail jsonb,
  dibuat timestamptz not null default now()
);
create index if not exists log_aktivitas_waktu on log_aktivitas(dibuat desc);

-- =====================================================================
-- FUNGSI BANTU (internal, tidak bisa dipanggil aplikasi)
-- =====================================================================

create or replace function _sekarang() returns timestamp
language sql stable as $$
  select now() at time zone coalesce((select zona_waktu from pengaturan where id = 1), 'Asia/Makassar');
$$;

create or replace function _log(p_staf uuid, p_aksi text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into log_aktivitas(staf_id, aksi, detail) values (p_staf, p_aksi, p_detail);
$$;

-- apakah staf sedang di jam shift-nya?
create or replace function _dalam_shift(p_staf uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  s staf; t timestamp := _sekarang(); hr int; jm time; hr_kemarin int;
begin
  select * into s from staf where id = p_staf;
  if s.peran = 'owner' or s.bebas_jadwal then return true; end if;
  hr := extract(dow from t)::int; jm := t::time; hr_kemarin := (hr + 6) % 7;
  return exists (
    select 1 from jadwal_shift j where j.staf_id = p_staf and (
      -- shift normal (mis. 08:00-16:00)
      (j.jam_mulai < j.jam_selesai and j.hari = hr and jm >= j.jam_mulai and jm < j.jam_selesai)
      -- shift lewat tengah malam (mis. 20:00-02:00)
      or (j.jam_mulai >= j.jam_selesai and j.hari = hr and jm >= j.jam_mulai)
      or (j.jam_mulai >= j.jam_selesai and j.hari = hr_kemarin and jm < j.jam_selesai)
    ));
end $$;

-- validasi token sesi -> kembalikan data staf. Sesi kedaluwarsa bila
-- tidak dipakai 15 menit, atau jam shift sudah habis.
create or replace function _sesi(p_token uuid) returns staf
language plpgsql security definer set search_path = public as $$
declare ss staf_sesi; s staf;
begin
  if auth.uid() is null or not _akun_sah() then
    raise exception 'AKUN_TIDAK_SAH: akun ini belum terdaftar sebagai akun toko';
  end if;
  select * into ss from staf_sesi where token = p_token and selesai is null;
  if not found then raise exception 'SESI_HABIS: silakan masuk dengan kode & PIN'; end if;
  if ss.terakhir < now() - interval '15 minutes' then
    update staf_sesi set selesai = now() where token = p_token;
    raise exception 'SESI_HABIS: sesi berakhir karena lama tidak dipakai';
  end if;
  select * into s from staf where id = ss.staf_id;
  if not s.aktif then raise exception 'STAF_NONAKTIF: akun karyawan dinonaktifkan owner'; end if;
  if not _dalam_shift(s.id) then
    update staf_sesi set selesai = now() where token = p_token;
    raise exception 'DILUAR_SHIFT: jam shift Anda sudah berakhir';
  end if;
  update staf_sesi set terakhir = now() where token = p_token;
  return s;
end $$;

create or replace function _wajib_owner(s staf) returns void
language plpgsql as $$
begin
  if s.peran <> 'owner' then raise exception 'KHUSUS_OWNER: hanya owner yang boleh melakukan ini'; end if;
end $$;

create or replace function _nomor(p_awalan text) returns text
language plpgsql security definer set search_path = public as $$
declare tgl date := _sekarang()::date; n int;
begin
  insert into nomor_urut(awalan, tanggal, n) values (p_awalan, tgl, 1)
  on conflict (awalan, tanggal) do update set n = nomor_urut.n + 1
  returning nomor_urut.n into n;
  return p_awalan || to_char(tgl, 'YYMMDD') || lpad(n::text, 3, '0');
end $$;

-- ubah stok + catat mutasi (stok tidak boleh minus)
create or replace function _ubah_stok(p_produk uuid, p_qty int, p_jenis text, p_ref text, p_staf uuid)
returns void language plpgsql security definer set search_path = public as $$
declare baru int; nm text;
begin
  update produk set stok = stok + p_qty, diubah = now() where id = p_produk
  returning stok, nama into baru, nm;
  if not found then raise exception 'PRODUK_TIDAK_ADA'; end if;
  if baru < 0 then raise exception 'STOK_KURANG: stok "%" tidak cukup', nm; end if;
  insert into stok_mutasi(produk_id, jenis, qty, stok_akhir, ref, staf_id)
  values (p_produk, p_jenis, p_qty, baru, p_ref, p_staf);
end $$;

create or replace function _pelanggan(p_nama text, p_hp text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; v_hp text := nullif(regexp_replace(coalesce(p_hp,''), '[^0-9+]', '', 'g'), '');
begin
  if coalesce(trim(p_nama),'') = '' and v_hp is null then return null; end if;
  if v_hp is not null then
    select id into pid from pelanggan where pelanggan.hp = v_hp;
    if found then
      if coalesce(trim(p_nama),'') <> '' then update pelanggan set nama = trim(p_nama) where id = pid; end if;
      return pid;
    end if;
  end if;
  insert into pelanggan(nama, hp) values (coalesce(nullif(trim(p_nama),''), 'Pelanggan'), v_hp) returning id into pid;
  return pid;
end $$;

create or replace function _promo_berlaku(p promo) returns boolean
language sql stable as $$
  select p.aktif and (p.mulai is null or p.mulai <= _sekarang()::date)
                 and (p.selesai is null or p.selesai >= _sekarang()::date);
$$;

-- =====================================================================
-- FUNGSI UNTUK APLIKASI (RPC)
-- =====================================================================

-- Daftarkan akun email pertama sebagai akun toko (hanya sekali, saat tabel kosong)
create or replace function daftarkan_akun_pertama() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'BELUM_LOGIN'; end if;
  if exists (select 1 from akun_toko) then return _akun_sah(); end if;
  insert into akun_toko(user_id, email) select auth.uid(), (select email from auth.users where id = auth.uid());
  return true;
end $$;

-- Buat owner pertama (hanya jika belum ada staf sama sekali)
create or replace function buat_owner_pertama(p_kode text, p_nama text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid;
begin
  if not _akun_sah() then raise exception 'AKUN_TIDAK_SAH'; end if;
  if exists (select 1 from staf) then raise exception 'SUDAH_ADA_OWNER'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_HARUS_6_ANGKA'; end if;
  insert into staf(kode, nama, peran, bebas_jadwal) values (upper(trim(p_kode)), trim(p_nama), 'owner', true) returning id into sid;
  insert into staf_pin(staf_id, pin_hash) values (sid, crypt(p_pin, gen_salt('bf')));
  perform _log(sid, 'buat_owner', jsonb_build_object('kode', p_kode));
  return true;
end $$;

create or replace function status_aplikasi() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'akun_sah', _akun_sah(),
    'ada_akun', exists (select 1 from akun_toko),
    'ada_staf', exists (select 1 from staf));
$$;

-- LOGIN KARYAWAN: kode + PIN -> token sesi
create or replace function masuk_staf(p_kode text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s staf; p staf_pin; tok uuid;
begin
  if not _akun_sah() then raise exception 'AKUN_TIDAK_SAH'; end if;
  select * into s from staf where kode = upper(trim(p_kode));
  if not found then raise exception 'KODE_SALAH: kode karyawan tidak ditemukan'; end if;
  if not s.aktif then raise exception 'STAF_NONAKTIF: akun karyawan dinonaktifkan owner'; end if;
  select * into p from staf_pin where staf_id = s.id;
  if p.kunci_sampai is not null and p.kunci_sampai > now() then
    raise exception 'TERKUNCI: terlalu banyak PIN salah, coba lagi pukul %',
      to_char(p.kunci_sampai at time zone (select zona_waktu from pengaturan where id=1), 'HH24:MI');
  end if;
  if p.pin_hash is null or crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update staf_pin set gagal = gagal + 1,
      kunci_sampai = case when gagal + 1 >= 5 then now() + interval '5 minutes' else null end
    where staf_id = s.id;
    perform _log(s.id, 'pin_salah', null);
    raise exception 'PIN_SALAH: PIN tidak cocok';
  end if;
  update staf_pin set gagal = 0, kunci_sampai = null where staf_id = s.id;
  if not _dalam_shift(s.id) then
    perform _log(s.id, 'masuk_ditolak_diluar_shift', null);
    raise exception 'DILUAR_SHIFT: sekarang bukan jam shift Anda';
  end if;
  -- satu karyawan = satu sesi aktif
  update staf_sesi set selesai = now() where staf_id = s.id and selesai is null;
  insert into staf_sesi(staf_id, user_id) values (s.id, auth.uid()) returning token into tok;
  perform _log(s.id, 'masuk', null);
  return jsonb_build_object('token', tok, 'id', s.id, 'kode', s.kode, 'nama', s.nama, 'peran', s.peran, 'warna', s.warna);
end $$;

create or replace function cek_sesi(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token);
  return jsonb_build_object('id', s.id, 'kode', s.kode, 'nama', s.nama, 'peran', s.peran, 'warna', s.warna);
end $$;

create or replace function keluar_staf(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  update staf_sesi set selesai = now() where token = p_token and selesai is null returning staf_id into sid;
  if sid is not null then perform _log(sid, 'keluar', null); end if;
end $$;

create or replace function ganti_pin_sendiri(p_token uuid, p_pin_lama text, p_pin_baru text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s staf; h text;
begin
  s := _sesi(p_token);
  select pin_hash into h from staf_pin where staf_id = s.id;
  if crypt(p_pin_lama, h) <> h then raise exception 'PIN_SALAH: PIN lama tidak cocok'; end if;
  if p_pin_baru !~ '^[0-9]{6}$' then raise exception 'PIN_HARUS_6_ANGKA'; end if;
  update staf_pin set pin_hash = crypt(p_pin_baru, gen_salt('bf')) where staf_id = s.id;
  perform _log(s.id, 'ganti_pin', null);
end $$;

-- ---------------- OWNER: kelola karyawan & jadwal ----------------
create or replace function simpan_staf(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare s staf; sid uuid := nullif(p_data->>'id','')::uuid; pin text := p_data->>'pin';
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if sid is null then
    if pin is null or pin !~ '^[0-9]{6}$' then raise exception 'PIN_HARUS_6_ANGKA'; end if;
    insert into staf(kode, nama, peran, hp, aktif, bebas_jadwal, warna)
    values (upper(trim(p_data->>'kode')), trim(p_data->>'nama'), coalesce(p_data->>'peran','kasir'),
            coalesce(p_data->>'hp',''), coalesce((p_data->>'aktif')::boolean, true),
            coalesce((p_data->>'bebas_jadwal')::boolean, false), coalesce(p_data->>'warna','#10b981'))
    returning id into sid;
    insert into staf_pin(staf_id, pin_hash) values (sid, crypt(pin, gen_salt('bf')));
  else
    if sid = s.id and coalesce(p_data->>'peran','owner') <> 'owner' then
      raise exception 'TIDAK_BOLEH: owner tidak bisa menurunkan perannya sendiri';
    end if;
    update staf set kode = upper(trim(p_data->>'kode')), nama = trim(p_data->>'nama'),
      peran = coalesce(p_data->>'peran', peran), hp = coalesce(p_data->>'hp', hp),
      aktif = coalesce((p_data->>'aktif')::boolean, aktif),
      bebas_jadwal = coalesce((p_data->>'bebas_jadwal')::boolean, bebas_jadwal),
      warna = coalesce(p_data->>'warna', warna)
    where id = sid;
    if pin is not null and pin <> '' then
      if pin !~ '^[0-9]{6}$' then raise exception 'PIN_HARUS_6_ANGKA'; end if;
      update staf_pin set pin_hash = crypt(pin, gen_salt('bf')), gagal = 0, kunci_sampai = null where staf_id = sid;
    end if;
    if not coalesce((p_data->>'aktif')::boolean, true) then
      update staf_sesi set selesai = now() where staf_id = sid and selesai is null;
    end if;
  end if;
  perform _log(s.id, 'simpan_staf', p_data - 'pin');
  return sid;
end $$;

create or replace function simpan_jadwal(p_token uuid, p_staf uuid, p_jadwal jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; j jsonb;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  delete from jadwal_shift where staf_id = p_staf;
  for j in select * from jsonb_array_elements(coalesce(p_jadwal,'[]'::jsonb)) loop
    insert into jadwal_shift(staf_id, hari, jam_mulai, jam_selesai, nama_shift)
    values (p_staf, (j->>'hari')::int, (j->>'jam_mulai')::time, (j->>'jam_selesai')::time, coalesce(j->>'nama_shift',''));
  end loop;
  perform _log(s.id, 'simpan_jadwal', jsonb_build_object('staf', p_staf, 'jadwal', p_jadwal));
end $$;

create or replace function simpan_pengaturan(p_token uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  update pengaturan set
    nama_toko = coalesce(p_data->>'nama_toko', nama_toko),
    alamat = coalesce(p_data->>'alamat', alamat),
    telepon = coalesce(p_data->>'telepon', telepon),
    catatan_nota = coalesce(p_data->>'catatan_nota', catatan_nota),
    syarat_garansi = coalesce(p_data->>'syarat_garansi', syarat_garansi),
    garansi_jual_hari = coalesce((p_data->>'garansi_jual_hari')::int, garansi_jual_hari),
    garansi_servis_hari = coalesce((p_data->>'garansi_servis_hari')::int, garansi_servis_hari),
    stok_minimum_default = coalesce((p_data->>'stok_minimum_default')::int, stok_minimum_default),
    menit_kunci = coalesce((p_data->>'menit_kunci')::int, menit_kunci),
    diubah = now()
  where id = 1;
  perform _log(s.id, 'simpan_pengaturan', p_data);
end $$;

-- ---------------- OWNER: produk, kategori, harga ----------------
create or replace function simpan_kategori(p_token uuid, p_id uuid, p_nama text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; kid uuid := p_id;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if kid is null then insert into kategori(nama) values (trim(p_nama)) returning id into kid;
  else update kategori set nama = trim(p_nama) where id = kid; end if;
  return kid;
end $$;

create or replace function simpan_produk(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; pid uuid := nullif(p_data->>'id','')::uuid; lama produk; bc text; kd text; stok_awal int;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  bc := nullif(trim(coalesce(p_data->>'barcode','')), '');
  kd := nullif(upper(trim(coalesce(p_data->>'kode',''))), '');
  if pid is null then
    if kd is null then kd := 'BRG-' || lpad((select count(*) + 1 from produk)::text, 4, '0'); end if;
    if bc is null then
      loop
        bc := '20' || lpad((floor(random() * 1e10))::bigint::text, 10, '0');
        exit when not exists (select 1 from produk where barcode = bc);
      end loop;
    end if;
    stok_awal := coalesce((p_data->>'stok')::int, 0);
    insert into produk(kode, barcode, nama, kategori_id, harga_beli, harga_jual, stok, stok_minimum, satuan, garansi_hari, aktif)
    values (kd, bc, trim(p_data->>'nama'), nullif(p_data->>'kategori_id','')::uuid,
      coalesce((p_data->>'harga_beli')::numeric,0), coalesce((p_data->>'harga_jual')::numeric,0), 0,
      nullif(p_data->>'stok_minimum','')::int, coalesce(nullif(p_data->>'satuan',''),'pcs'),
      nullif(p_data->>'garansi_hari','')::int, coalesce((p_data->>'aktif')::boolean, true))
    returning id into pid;
    if stok_awal <> 0 then perform _ubah_stok(pid, stok_awal, 'masuk', 'stok awal', s.id); end if;
  else
    select * into lama from produk where id = pid;
    update produk set kode = coalesce(kd, kode), barcode = coalesce(bc, barcode), nama = trim(p_data->>'nama'),
      kategori_id = nullif(p_data->>'kategori_id','')::uuid,
      harga_beli = coalesce((p_data->>'harga_beli')::numeric, harga_beli),
      harga_jual = coalesce((p_data->>'harga_jual')::numeric, harga_jual),
      stok_minimum = nullif(p_data->>'stok_minimum','')::int,
      satuan = coalesce(nullif(p_data->>'satuan',''), satuan),
      garansi_hari = nullif(p_data->>'garansi_hari','')::int,
      aktif = coalesce((p_data->>'aktif')::boolean, aktif), diubah = now()
    where id = pid;
    if lama.harga_beli is distinct from coalesce((p_data->>'harga_beli')::numeric, lama.harga_beli)
       or lama.harga_jual is distinct from coalesce((p_data->>'harga_jual')::numeric, lama.harga_jual) then
      insert into harga_log(produk_id, beli_lama, beli_baru, jual_lama, jual_baru, staf_id)
      select pid, lama.harga_beli, harga_beli, lama.harga_jual, harga_jual, s.id from produk where id = pid;
    end if;
  end if;
  perform _log(s.id, 'simpan_produk', p_data);
  return pid;
end $$;

-- naik/turunkan harga massal: persen (+10 / -5) atau nominal, per kategori atau semua
create or replace function ubah_harga_massal(p_token uuid, p_kategori uuid, p_mode text, p_nilai numeric, p_bulat int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare s staf; n int := 0; r produk; baru numeric;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  for r in select * from produk where aktif and (p_kategori is null or kategori_id = p_kategori) loop
    if p_mode = 'persen' then baru := r.harga_jual * (1 + p_nilai / 100.0);
    else baru := r.harga_jual + p_nilai; end if;
    if coalesce(p_bulat,0) > 0 then baru := round(baru / p_bulat) * p_bulat; end if;
    if baru < 0 then baru := 0; end if;
    if baru <> r.harga_jual then
      update produk set harga_jual = baru, diubah = now() where id = r.id;
      insert into harga_log(produk_id, beli_lama, beli_baru, jual_lama, jual_baru, staf_id)
      values (r.id, r.harga_beli, r.harga_beli, r.harga_jual, baru, s.id);
      n := n + 1;
    end if;
  end loop;
  perform _log(s.id, 'ubah_harga_massal', jsonb_build_object('kategori', p_kategori, 'mode', p_mode, 'nilai', p_nilai, 'jumlah', n));
  return n;
end $$;

-- barang masuk (beli dari supplier)
create or replace function stok_masuk(p_token uuid, p_produk uuid, p_qty int, p_harga_beli numeric, p_ket text)
returns void language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if p_qty <= 0 then raise exception 'QTY_HARUS_POSITIF'; end if;
  perform _ubah_stok(p_produk, p_qty, 'masuk', coalesce(p_ket,'barang masuk'), s.id);
  if p_harga_beli is not null and p_harga_beli > 0 then
    update produk set harga_beli = p_harga_beli where id = p_produk;
  end if;
end $$;

create or replace function simpan_promo(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; pid uuid := nullif(p_data->>'id','')::uuid;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if pid is null then insert into promo(nama, jenis, syarat) values ('-', 'gratis', 'produk') returning id into pid; end if;
  update promo set
    nama = p_data->>'nama', jenis = p_data->>'jenis', syarat = p_data->>'syarat',
    syarat_produk_id = nullif(p_data->>'syarat_produk_id','')::uuid,
    syarat_kategori_id = nullif(p_data->>'syarat_kategori_id','')::uuid,
    syarat_kata_servis = nullif(p_data->>'syarat_kata_servis',''),
    min_qty = coalesce(nullif(p_data->>'min_qty','')::int, 1),
    min_belanja = coalesce(nullif(p_data->>'min_belanja','')::numeric, 0),
    nilai = coalesce(nullif(p_data->>'nilai','')::numeric, 0),
    hadiah_produk_id = nullif(p_data->>'hadiah_produk_id','')::uuid,
    hadiah_qty = coalesce(nullif(p_data->>'hadiah_qty','')::int, 1),
    mulai = nullif(p_data->>'mulai','')::date, selesai = nullif(p_data->>'selesai','')::date,
    aktif = coalesce((p_data->>'aktif')::boolean, true)
  where id = pid;
  perform _log(s.id, 'simpan_promo', p_data);
  return pid;
end $$;

create or replace function hapus_promo(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  update promo set aktif = false where id = p_id;
  perform _log(s.id, 'nonaktif_promo', jsonb_build_object('id', p_id));
end $$;

-- ---------------- KASIR: transaksi penjualan ----------------
-- p_items: [{produk_id, qty}]  — harga diambil dari server
create or replace function buat_transaksi(p_token uuid, p_items jsonb, p_bayar numeric, p_metode text,
  p_pelanggan_nama text default null, p_pelanggan_hp text default null, p_diskon numeric default 0, p_catatan text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s staf; tid uuid; nomor text; it jsonb; pr produk; q int; pg pengaturan;
  sub numeric := 0; dsk numeric := 0; tot numeric; mdl numeric := 0; diskon_baris numeric; pm promo;
  gar int; ada boolean;
begin
  s := _sesi(p_token);
  if s.peran not in ('owner','kasir') then raise exception 'TIDAK_BOLEH: hanya kasir/owner yang bisa berjualan'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'KERANJANG_KOSONG'; end if;
  if coalesce(p_diskon,0) > 0 and s.peran <> 'owner' then raise exception 'KHUSUS_OWNER: diskon manual hanya oleh owner'; end if;
  select * into pg from pengaturan where id = 1;
  nomor := _nomor('TR');
  insert into transaksi(nomor, staf_id, pelanggan_id, metode, catatan)
  values (nomor, s.id, _pelanggan(p_pelanggan_nama, p_pelanggan_hp), coalesce(p_metode,'tunai'), coalesce(p_catatan,''))
  returning id into tid;

  -- item yang dibeli
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::int;
    if q is null or q <= 0 then raise exception 'QTY_TIDAK_VALID'; end if;
    select * into pr from produk where id = (it->>'produk_id')::uuid and aktif;
    if not found then raise exception 'PRODUK_TIDAK_ADA'; end if;
    -- promo diskon terbaik untuk produk ini
    diskon_baris := 0;
    select * into pm from promo p where _promo_berlaku(p) and p.jenis in ('diskon_persen','diskon_nominal')
      and ((p.syarat = 'produk' and p.syarat_produk_id = pr.id) or (p.syarat = 'kategori' and p.syarat_kategori_id = pr.kategori_id))
      and q >= p.min_qty
      order by case when p.jenis = 'diskon_persen' then pr.harga_jual * p.nilai / 100 else p.nilai end desc limit 1;
    if found then
      diskon_baris := least(pr.harga_jual, round(case when pm.jenis = 'diskon_persen' then pr.harga_jual * pm.nilai / 100 else pm.nilai end)) * q;
    end if;
    gar := coalesce(pr.garansi_hari, pg.garansi_jual_hari);
    insert into transaksi_item(transaksi_id, produk_id, nama, qty, harga, harga_beli, diskon, subtotal, promo_id, garansi_hari)
    values (tid, pr.id, pr.nama, q, pr.harga_jual, pr.harga_beli, diskon_baris, pr.harga_jual * q - diskon_baris,
            case when diskon_baris > 0 then pm.id end, gar);
    perform _ubah_stok(pr.id, -q, 'jual', nomor, s.id);
    sub := sub + pr.harga_jual * q; dsk := dsk + diskon_baris; mdl := mdl + pr.harga_beli * q;
  end loop;

  -- promo barang gratis
  for pm in select * from promo p where _promo_berlaku(p) and p.jenis = 'gratis' and p.syarat <> 'servis' loop
    ada := case pm.syarat
      when 'produk' then (select coalesce(sum(qty),0) from transaksi_item where transaksi_id = tid and produk_id = pm.syarat_produk_id and not gratis) >= pm.min_qty
      when 'kategori' then (select coalesce(sum(ti.qty),0) from transaksi_item ti join produk x on x.id = ti.produk_id
                            where ti.transaksi_id = tid and x.kategori_id = pm.syarat_kategori_id and not ti.gratis) >= pm.min_qty
      when 'min_belanja' then (sub - dsk) >= pm.min_belanja
      else false end;
    if ada and pm.hadiah_produk_id is not null then
      select * into pr from produk where id = pm.hadiah_produk_id;
      if pr.stok >= pm.hadiah_qty then
        insert into transaksi_item(transaksi_id, produk_id, nama, qty, harga, harga_beli, diskon, subtotal, gratis, promo_id, garansi_hari)
        values (tid, pr.id, pr.nama || ' (GRATIS)', pm.hadiah_qty, pr.harga_jual, pr.harga_beli, pr.harga_jual * pm.hadiah_qty, 0, true, pm.id,
                coalesce(pr.garansi_hari, pg.garansi_jual_hari));
        perform _ubah_stok(pr.id, -pm.hadiah_qty, 'promo', nomor, s.id);
        mdl := mdl + pr.harga_beli * pm.hadiah_qty;
      end if;
    end if;
  end loop;

  dsk := dsk + coalesce(p_diskon, 0);
  tot := greatest(sub - dsk, 0);
  if coalesce(p_metode,'tunai') = 'tunai' and coalesce(p_bayar,0) < tot then raise exception 'UANG_KURANG: pembayaran kurang dari total'; end if;
  update transaksi set subtotal = sub, diskon = dsk, total = tot, modal = mdl,
    bayar = case when coalesce(p_metode,'tunai') = 'tunai' then p_bayar else tot end,
    kembali = case when coalesce(p_metode,'tunai') = 'tunai' then p_bayar - tot else 0 end
  where id = tid;
  perform _log(s.id, 'transaksi', jsonb_build_object('nomor', nomor, 'total', tot));
  return jsonb_build_object('id', tid, 'nomor', nomor, 'total', tot);
end $$;

-- batal transaksi: hanya owner (stok kembali)
create or replace function batal_transaksi(p_token uuid, p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; t transaksi; i transaksi_item;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into t from transaksi where id = p_id for update;
  if t.status <> 'selesai' then raise exception 'SUDAH_BATAL'; end if;
  if exists (select 1 from retur where transaksi_id = p_id and status <> 'ditolak') then raise exception 'ADA_RETUR: transaksi ini sudah punya retur'; end if;
  for i in select * from transaksi_item where transaksi_id = p_id loop
    if i.produk_id is not null then perform _ubah_stok(i.produk_id, i.qty, 'batal_jual', t.nomor, s.id); end if;
  end loop;
  update transaksi set status = 'batal', batal_oleh = s.id, batal_alasan = p_alasan, batal_waktu = now() where id = p_id;
  perform _log(s.id, 'batal_transaksi', jsonb_build_object('nomor', t.nomor, 'alasan', p_alasan));
end $$;

-- ---------------- RETUR ----------------
-- p_items: [{transaksi_item_id, qty, kembali_stok}]
create or replace function ajukan_retur(p_token uuid, p_transaksi uuid, p_items jsonb, p_alasan text, p_tindakan text default 'uang_kembali')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s staf; t transaksi; rid uuid; nomor text; it jsonb; ti transaksi_item; q int; tot numeric := 0; sisa int;
begin
  s := _sesi(p_token);
  select * into t from transaksi where id = p_transaksi;
  if not found or t.status <> 'selesai' then raise exception 'TRANSAKSI_TIDAK_VALID'; end if;
  if coalesce(trim(p_alasan),'') = '' then raise exception 'ALASAN_WAJIB'; end if;
  nomor := _nomor('RT');
  insert into retur(nomor, transaksi_id, staf_id, alasan, tindakan) values (nomor, t.id, s.id, p_alasan, coalesce(p_tindakan,'uang_kembali')) returning id into rid;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into ti from transaksi_item where id = (it->>'transaksi_item_id')::uuid and transaksi_id = t.id;
    if not found then raise exception 'ITEM_TIDAK_ADA'; end if;
    q := (it->>'qty')::int;
    sisa := ti.qty - ti.qty_retur - coalesce((select sum(ri.qty) from retur_item ri join retur r on r.id = ri.retur_id
                                               where ri.transaksi_item_id = ti.id and r.status = 'menunggu' and r.id <> rid), 0);
    if q is null or q <= 0 or q > sisa then raise exception 'QTY_RETUR_MELEBIHI: maksimal % untuk %', sisa, ti.nama; end if;
    insert into retur_item(retur_id, transaksi_item_id, produk_id, qty, nominal, kembali_stok)
    values (rid, ti.id, ti.produk_id, q, round(ti.subtotal / ti.qty) * q, coalesce((it->>'kembali_stok')::boolean, true));
    tot := tot + round(ti.subtotal / ti.qty) * q;
  end loop;
  update retur set total = tot where id = rid;
  perform _log(s.id, 'ajukan_retur', jsonb_build_object('nomor', nomor, 'transaksi', t.nomor, 'total', tot));
  return jsonb_build_object('id', rid, 'nomor', nomor, 'total', tot);
end $$;

create or replace function putuskan_retur(p_token uuid, p_id uuid, p_setuju boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; r retur; ri retur_item;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into r from retur where id = p_id for update;
  if r.status <> 'menunggu' then raise exception 'SUDAH_DIPUTUS'; end if;
  if p_setuju then
    for ri in select * from retur_item where retur_id = p_id loop
      update transaksi_item set qty_retur = qty_retur + ri.qty where id = ri.transaksi_item_id;
      if ri.kembali_stok and ri.produk_id is not null then perform _ubah_stok(ri.produk_id, ri.qty, 'retur', r.nomor, s.id); end if;
    end loop;
  end if;
  update retur set status = case when p_setuju then 'disetujui' else 'ditolak' end, diputus_oleh = s.id, diputus_waktu = now() where id = p_id;
  perform _log(s.id, 'putuskan_retur', jsonb_build_object('nomor', r.nomor, 'setuju', p_setuju));
end $$;

-- ---------------- SERVIS ----------------
create or replace function buat_servis(p_token uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf; sid uuid; nomor text; dp numeric := coalesce(nullif(p_data->>'dp','')::numeric, 0);
begin
  s := _sesi(p_token);
  if coalesce(trim(p_data->>'nama'),'') = '' then raise exception 'NAMA_WAJIB'; end if;
  nomor := _nomor('SV');
  insert into servis(nomor, pelanggan_id, nama, hp, merek, tipe, imei, jenis_servis, keluhan, kelengkapan, kondisi, sandi_hp,
                     estimasi_biaya, staf_terima_id, garansi_hari, catatan)
  values (nomor, _pelanggan(p_data->>'nama', p_data->>'hp'), trim(p_data->>'nama'), coalesce(p_data->>'hp',''),
    coalesce(p_data->>'merek',''), coalesce(p_data->>'tipe',''), coalesce(trim(p_data->>'imei'),''),
    coalesce(p_data->>'jenis_servis',''), coalesce(p_data->>'keluhan',''), coalesce(p_data->>'kelengkapan',''),
    coalesce(p_data->>'kondisi',''), coalesce(p_data->>'sandi_hp',''),
    coalesce(nullif(p_data->>'estimasi_biaya','')::numeric, 0), s.id,
    coalesce(nullif(p_data->>'garansi_hari','')::int, (select garansi_servis_hari from pengaturan where id = 1)),
    coalesce(p_data->>'catatan',''))
  returning id into sid;
  insert into servis_log(servis_id, status, catatan, staf_id) values (sid, 'antri', 'Servis diterima', s.id);
  if dp > 0 then
    insert into servis_bayar(servis_id, nominal, metode, jenis, staf_id) values (sid, dp, coalesce(p_data->>'metode_dp','tunai'), 'dp', s.id);
  end if;
  perform _log(s.id, 'servis_baru', jsonb_build_object('nomor', nomor));
  return jsonb_build_object('id', sid, 'nomor', nomor);
end $$;

create or replace function ubah_servis(p_token uuid, p_id uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; v servis;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_id;
  if v.status in ('diambil','batal') and s.peran <> 'owner' then raise exception 'TIDAK_BOLEH: servis sudah selesai'; end if;
  update servis set
    merek = coalesce(p_data->>'merek', merek), tipe = coalesce(p_data->>'tipe', tipe),
    imei = coalesce(p_data->>'imei', imei), jenis_servis = coalesce(p_data->>'jenis_servis', jenis_servis),
    keluhan = coalesce(p_data->>'keluhan', keluhan), kelengkapan = coalesce(p_data->>'kelengkapan', kelengkapan),
    kondisi = coalesce(p_data->>'kondisi', kondisi), catatan = coalesce(p_data->>'catatan', catatan),
    estimasi_biaya = coalesce(nullif(p_data->>'estimasi_biaya','')::numeric, estimasi_biaya),
    biaya_jasa = coalesce(nullif(p_data->>'biaya_jasa','')::numeric, biaya_jasa)
  where id = p_id;
  perform _log(s.id, 'ubah_servis', jsonb_build_object('nomor', v.nomor) || p_data);
end $$;

create or replace function ubah_status_servis(p_token uuid, p_id uuid, p_status text, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s staf; v servis;
begin
  s := _sesi(p_token);
  if p_status not in ('antri','dikerjakan','tunggu_sparepart','siap_diambil','batal') then raise exception 'STATUS_TIDAK_VALID'; end if;
  select * into v from servis where id = p_id for update;
  if v.status in ('diambil','batal') then raise exception 'TIDAK_BOLEH: servis sudah selesai'; end if;
  if p_status = 'batal' and s.peran <> 'owner' then raise exception 'KHUSUS_OWNER: pembatalan servis oleh owner'; end if;
  update servis set status = p_status,
    teknisi_id = case when p_status = 'dikerjakan' and (s.peran = 'teknisi' or teknisi_id is null) then s.id else teknisi_id end,
    selesai_waktu = case when p_status = 'siap_diambil' then now() else selesai_waktu end
  where id = p_id;
  insert into servis_log(servis_id, status, catatan, staf_id) values (p_id, p_status, coalesce(p_catatan,''), s.id);
end $$;

create or replace function tambah_sparepart_servis(p_token uuid, p_servis uuid, p_produk uuid, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare s staf; v servis; pr produk;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_servis;
  if v.status in ('diambil','batal') then raise exception 'TIDAK_BOLEH: servis sudah selesai'; end if;
  select * into pr from produk where id = p_produk and aktif;
  if not found then raise exception 'PRODUK_TIDAK_ADA'; end if;
  insert into servis_sparepart(servis_id, produk_id, nama, qty, harga, harga_beli, staf_id)
  values (p_servis, pr.id, pr.nama, p_qty, pr.harga_jual, pr.harga_beli, s.id);
  perform _ubah_stok(pr.id, -p_qty, 'servis', v.nomor, s.id);
  insert into servis_log(servis_id, status, catatan, staf_id) values (p_servis, v.status, 'Sparepart: ' || pr.nama || ' x' || p_qty, s.id);
end $$;

create or replace function hapus_sparepart_servis(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; sp servis_sparepart; v servis;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into sp from servis_sparepart where id = p_id;
  select * into v from servis where id = sp.servis_id;
  if v.status = 'diambil' then raise exception 'TIDAK_BOLEH: servis sudah diambil'; end if;
  if sp.produk_id is not null then perform _ubah_stok(sp.produk_id, sp.qty, 'koreksi', v.nomor || ' hapus sparepart', s.id); end if;
  delete from servis_sparepart where id = p_id;
  perform _log(s.id, 'hapus_sparepart', jsonb_build_object('nomor', v.nomor, 'nama', sp.nama));
end $$;

-- total tagihan servis
create or replace function servis_tagihan(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'jasa', v.biaya_jasa,
    'sparepart', coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = v.id), 0),
    'total', v.biaya_jasa + coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = v.id), 0),
    'dibayar', coalesce((select sum(nominal) from servis_bayar where servis_id = v.id), 0))
  from servis v where v.id = p_id;
$$;

create or replace function bayar_servis(p_token uuid, p_id uuid, p_nominal numeric, p_metode text default 'tunai')
returns void language plpgsql security definer set search_path = public as $$
declare s staf; v servis; tg jsonb;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_id;
  if v.status = 'batal' then raise exception 'SERVIS_BATAL'; end if;
  tg := servis_tagihan(p_id);
  if p_nominal <= 0 then raise exception 'NOMINAL_TIDAK_VALID'; end if;
  if (tg->>'dibayar')::numeric + p_nominal > (tg->>'total')::numeric and (tg->>'total')::numeric > 0 then
    raise exception 'BAYAR_LEBIH: sisa tagihan Rp %', (tg->>'total')::numeric - (tg->>'dibayar')::numeric;
  end if;
  insert into servis_bayar(servis_id, nominal, metode, jenis, staf_id)
  values (p_id, p_nominal, coalesce(p_metode,'tunai'), case when v.status = 'diambil' or v.status = 'siap_diambil' then 'pelunasan' else 'dp' end, s.id);
  insert into servis_log(servis_id, status, catatan, staf_id) values (p_id, v.status, 'Pembayaran Rp ' || p_nominal, s.id);
  perform _log(s.id, 'bayar_servis', jsonb_build_object('nomor', v.nomor, 'nominal', p_nominal));
end $$;

-- pelanggan mengambil HP: promo servis diterapkan, sisa bisa jadi "belum lunas"
create or replace function ambil_servis(p_token uuid, p_id uuid, p_bayar numeric default 0, p_metode text default 'tunai')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s staf; v servis; pm promo; pr produk; tg jsonb;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_id for update;
  if v.status <> 'siap_diambil' then raise exception 'BELUM_SIAP: servis belum berstatus Siap Diambil'; end if;
  -- promo gratis karena servis tertentu
  for pm in select * from promo p where _promo_berlaku(p) and p.jenis = 'gratis' and p.syarat = 'servis'
            and p.syarat_kata_servis is not null and v.jenis_servis ilike '%' || p.syarat_kata_servis || '%' loop
    if pm.hadiah_produk_id is not null and not exists (select 1 from servis_sparepart where servis_id = p_id and promo_id = pm.id) then
      select * into pr from produk where id = pm.hadiah_produk_id;
      if pr.stok >= pm.hadiah_qty then
        insert into servis_sparepart(servis_id, produk_id, nama, qty, harga, harga_beli, gratis, promo_id, staf_id)
        values (p_id, pr.id, pr.nama || ' (GRATIS)', pm.hadiah_qty, pr.harga_jual, pr.harga_beli, true, pm.id, s.id);
        perform _ubah_stok(pr.id, -pm.hadiah_qty, 'promo', v.nomor, s.id);
      end if;
    end if;
  end loop;
  if coalesce(p_bayar,0) > 0 then perform bayar_servis(p_token, p_id, p_bayar, p_metode); end if;
  update servis set status = 'diambil', diambil_waktu = now(), diambil_oleh = s.id where id = p_id;
  insert into servis_log(servis_id, status, catatan, staf_id) values (p_id, 'diambil', 'Diambil pelanggan', s.id);
  tg := servis_tagihan(p_id);
  perform _log(s.id, 'ambil_servis', jsonb_build_object('nomor', v.nomor) || tg);
  return tg;
end $$;

-- ---------------- STOK OPNAME ----------------
create or replace function buat_opname(p_token uuid, p_keterangan text, p_kategori uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; v_oid uuid;
begin
  s := _sesi(p_token);
  insert into opname(keterangan, staf_id) values (coalesce(p_keterangan,''), s.id) returning id into v_oid;
  insert into opname_item(opname_id, produk_id, stok_sistem, harga_beli)
  select v_oid, id, stok, harga_beli from produk where aktif and (p_kategori is null or kategori_id = p_kategori);
  perform _log(s.id, 'buat_opname', jsonb_build_object('id', v_oid, 'keterangan', p_keterangan));
  return v_oid;
end $$;

create or replace function isi_opname(p_token uuid, p_opname uuid, p_produk uuid, p_fisik int) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token);
  if (select status from opname where id = p_opname) <> 'draf' then raise exception 'OPNAME_SUDAH_FINAL'; end if;
  if p_fisik is not null and p_fisik < 0 then raise exception 'STOK_TIDAK_VALID'; end if;
  update opname_item set stok_fisik = p_fisik, diisi_oleh = s.id, diisi_waktu = now()
  where opname_id = p_opname and produk_id = p_produk;
end $$;

-- final: stok disesuaikan sebesar selisih (fisik - sistem saat opname dibuat)
create or replace function final_opname(p_token uuid, p_opname uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s staf; o opname; i opname_item; n int := 0;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into o from opname where id = p_opname for update;
  if o.status <> 'draf' then raise exception 'OPNAME_SUDAH_FINAL'; end if;
  for i in select * from opname_item where opname_id = p_opname and stok_fisik is not null and stok_fisik <> stok_sistem loop
    perform _ubah_stok(i.produk_id, i.stok_fisik - i.stok_sistem, 'opname', coalesce(nullif(o.keterangan,''),'opname'), s.id);
    n := n + 1;
  end loop;
  update opname set status = 'final', final_oleh = s.id, final_waktu = now() where id = p_opname;
  perform _log(s.id, 'final_opname', jsonb_build_object('id', p_opname, 'disesuaikan', n));
  return n;
end $$;

create or replace function batal_opname(p_token uuid, p_opname uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  update opname set status = 'batal' where id = p_opname and status = 'draf';
end $$;

-- ---------------- TUGAS & BONUS ----------------
create or replace function simpan_tugas(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; tid uuid := nullif(p_data->>'id','')::uuid;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if tid is null then
    insert into tugas(staf_id, tanggal, judul, keterangan, bonus, dibuat_oleh)
    values ((p_data->>'staf_id')::uuid, coalesce(nullif(p_data->>'tanggal','')::date, _sekarang()::date), p_data->>'judul',
            coalesce(p_data->>'keterangan',''), coalesce(nullif(p_data->>'bonus','')::numeric,0), s.id)
    returning id into tid;
  else
    update tugas set staf_id = (p_data->>'staf_id')::uuid, tanggal = (p_data->>'tanggal')::date, judul = p_data->>'judul',
      keterangan = coalesce(p_data->>'keterangan',''), bonus = coalesce(nullif(p_data->>'bonus','')::numeric,0)
    where id = tid;
  end if;
  return tid;
end $$;

create or replace function hapus_tugas(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  delete from tugas where id = p_id and status in ('baru','ditolak');
end $$;

-- karyawan menandai tugasnya SENDIRI selesai (tidak bisa menandai milik orang lain)
create or replace function selesaikan_tugas(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token);
  update tugas set status = 'selesai', selesai_waktu = now() where id = p_id and staf_id = s.id and status = 'baru';
  if not found then raise exception 'TIDAK_BOLEH: tugas ini bukan milik Anda'; end if;
end $$;

create or replace function nilai_tugas(p_token uuid, p_id uuid, p_setuju boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  update tugas set status = case when p_setuju then 'disetujui' else 'ditolak' end where id = p_id and status = 'selesai';
end $$;

create or replace function simpan_bonus_aturan(p_token uuid, p_aturan jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; a jsonb;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  delete from bonus_aturan;
  for a in select * from jsonb_array_elements(coalesce(p_aturan,'[]'::jsonb)) loop
    insert into bonus_aturan(peran, staf_id, jenis, nilai, aktif)
    values (nullif(a->>'peran',''), nullif(a->>'staf_id','')::uuid, a->>'jenis', coalesce((a->>'nilai')::numeric,0), coalesce((a->>'aktif')::boolean,true));
  end loop;
  perform _log(s.id, 'simpan_bonus', p_aturan);
end $$;

-- laporan bonus per karyawan (owner melihat semua; karyawan hanya dirinya)
create or replace function laporan_bonus(p_token uuid, p_dari date, p_sampai date)
returns table(staf_id uuid, kode text, nama text, peran text, jml_transaksi bigint, penjualan numeric,
              jml_servis bigint, jasa_servis numeric, bonus_tugas numeric, bonus_total numeric)
language plpgsql security definer set search_path = public as $$
declare s staf; tz text := (select zona_waktu from pengaturan where id = 1);
begin
  s := _sesi(p_token);
  return query
  with dasar as (
    select st.id, st.kode, st.nama, st.peran,
      (select count(*) from transaksi t where t.staf_id = st.id and t.status = 'selesai'
         and (t.dibuat at time zone tz)::date between p_dari and p_sampai) as jt,
      (select coalesce(sum(t.total - coalesce((select sum(r.total) from retur r where r.transaksi_id = t.id and r.status = 'disetujui'),0)),0)
         from transaksi t where t.staf_id = st.id and t.status = 'selesai'
         and (t.dibuat at time zone tz)::date between p_dari and p_sampai) as pj,
      (select count(*) from servis v where v.teknisi_id = st.id and v.status = 'diambil'
         and (v.diambil_waktu at time zone tz)::date between p_dari and p_sampai) as js,
      (select coalesce(sum(v.biaya_jasa),0) from servis v where v.teknisi_id = st.id and v.status = 'diambil'
         and (v.diambil_waktu at time zone tz)::date between p_dari and p_sampai) as jj,
      (select coalesce(sum(g.bonus),0) from tugas g where g.staf_id = st.id and g.status = 'disetujui'
         and g.tanggal between p_dari and p_sampai) as bt
    from staf st
    where st.peran <> 'owner' and (s.peran = 'owner' or st.id = s.id)
  )
  select d.id, d.kode, d.nama, d.peran, d.jt, d.pj, d.js, d.jj, d.bt,
    d.bt + coalesce((select sum(case a.jenis
        when 'per_transaksi' then a.nilai * d.jt
        when 'persen_penjualan' then round(d.pj * a.nilai / 100)
        when 'per_servis' then a.nilai * d.js
        when 'persen_jasa_servis' then round(d.jj * a.nilai / 100) end)
      from bonus_aturan a where a.aktif and (a.staf_id = d.id or (a.staf_id is null and (a.peran is null or a.peran = d.peran)))), 0)
  from dasar d order by d.kode;
end $$;

-- ---------------- PENGELUARAN ----------------
create or replace function simpan_pengeluaran(p_token uuid, p_tanggal date, p_ket text, p_nominal numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; pid uuid;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  insert into pengeluaran(tanggal, keterangan, nominal, staf_id) values (coalesce(p_tanggal, _sekarang()::date), p_ket, p_nominal, s.id) returning id into pid;
  perform _log(s.id, 'pengeluaran', jsonb_build_object('ket', p_ket, 'nominal', p_nominal));
  return pid;
end $$;

create or replace function hapus_pengeluaran(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  delete from pengeluaran where id = p_id;
  perform _log(s.id, 'hapus_pengeluaran', jsonb_build_object('id', p_id));
end $$;

-- =====================================================================
-- VIEW BANTU
-- =====================================================================
create or replace view v_stok_menipis with (security_invoker = true) as
  select p.*, coalesce(p.stok_minimum, (select stok_minimum_default from pengaturan where id = 1)) as batas
  from produk p
  where p.aktif and p.stok <= coalesce(p.stok_minimum, (select stok_minimum_default from pengaturan where id = 1));

create or replace view v_servis as
  select v.*,
    coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = v.id), 0) as biaya_sparepart,
    v.biaya_jasa + coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = v.id), 0) as total_tagihan,
    coalesce((select sum(nominal) from servis_bayar where servis_id = v.id), 0) as dibayar,
    st.nama as nama_penerima, tk.nama as nama_teknisi
  from servis v
  left join staf st on st.id = v.staf_terima_id
  left join staf tk on tk.id = v.teknisi_id;
alter view v_servis set (security_invoker = true);

-- =====================================================================
-- KEAMANAN: RLS + HAK AKSES
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['akun_toko','pengaturan','staf','staf_pin','jadwal_shift','staf_sesi','kategori','produk',
    'stok_mutasi','harga_log','pelanggan','promo','nomor_urut','transaksi','transaksi_item','retur','retur_item',
    'servis','servis_sparepart','servis_bayar','servis_log','opname','opname_item','tugas','bonus_aturan',
    'pengeluaran','log_aktivitas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
    execute format('drop policy if exists baca on %I', t);
  end loop;
  -- tabel yang boleh DIBACA oleh akun toko (tidak ada yang boleh ditulis langsung)
  foreach t in array array['pengaturan','staf','jadwal_shift','kategori','produk','stok_mutasi','harga_log','pelanggan',
    'promo','transaksi','transaksi_item','retur','retur_item','servis','servis_sparepart','servis_bayar','servis_log',
    'opname','opname_item','tugas','bonus_aturan','pengeluaran','log_aktivitas'] loop
    execute format('grant select on table %I to authenticated', t);
    execute format('create policy baca on %I for select to authenticated using (_akun_sah())', t);
  end loop;
  -- staf_pin, staf_sesi, nomor_urut, akun_toko: TIDAK bisa dibaca aplikasi sama sekali
end $$;

grant select on v_stok_menipis, v_servis to authenticated;
revoke all on v_stok_menipis, v_servis from anon;

-- fungsi: tutup semua, lalu buka yang untuk aplikasi saja
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  _akun_sah(), status_aplikasi(), daftarkan_akun_pertama(), buat_owner_pertama(text,text,text),
  masuk_staf(text,text), cek_sesi(uuid), keluar_staf(uuid), ganti_pin_sendiri(uuid,text,text),
  simpan_staf(uuid,jsonb), simpan_jadwal(uuid,uuid,jsonb), simpan_pengaturan(uuid,jsonb),
  simpan_kategori(uuid,uuid,text), simpan_produk(uuid,jsonb), ubah_harga_massal(uuid,uuid,text,numeric,int),
  stok_masuk(uuid,uuid,int,numeric,text), simpan_promo(uuid,jsonb), hapus_promo(uuid,uuid),
  buat_transaksi(uuid,jsonb,numeric,text,text,text,numeric,text), batal_transaksi(uuid,uuid,text),
  ajukan_retur(uuid,uuid,jsonb,text,text), putuskan_retur(uuid,uuid,boolean),
  buat_servis(uuid,jsonb), ubah_servis(uuid,uuid,jsonb), ubah_status_servis(uuid,uuid,text,text),
  tambah_sparepart_servis(uuid,uuid,uuid,int), hapus_sparepart_servis(uuid,uuid), servis_tagihan(uuid),
  bayar_servis(uuid,uuid,numeric,text), ambil_servis(uuid,uuid,numeric,text),
  buat_opname(uuid,text,uuid), isi_opname(uuid,uuid,uuid,int), final_opname(uuid,uuid), batal_opname(uuid,uuid),
  simpan_tugas(uuid,jsonb), hapus_tugas(uuid,uuid), selesaikan_tugas(uuid,uuid), nilai_tugas(uuid,uuid,boolean),
  simpan_bonus_aturan(uuid,jsonb), laporan_bonus(uuid,date,date),
  simpan_pengeluaran(uuid,date,text,numeric), hapus_pengeluaran(uuid,uuid),
  _sekarang(), _promo_berlaku(promo)
to authenticated;

-- realtime (data langsung muncul di semua perangkat)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table transaksi; exception when others then null; end;
    begin alter publication supabase_realtime add table servis; exception when others then null; end;
    begin alter publication supabase_realtime add table produk; exception when others then null; end;
    begin alter publication supabase_realtime add table retur; exception when others then null; end;
    begin alter publication supabase_realtime add table tugas; exception when others then null; end;
  end if;
end $$;

-- selesai
select 'ZAMRUD KASIR: database siap ✅' as hasil;
