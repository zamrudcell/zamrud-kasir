-- =====================================================================
-- ZAMRUD KASIR — 006: member & harga member
-- * owner menjadikan pelanggan member -> kode member (ZM-0001) + no WA terdaftar
-- * harga member per produk (diisi owner)
-- * harga member hanya berlaku bila KODE MEMBER + NO WA cocok (dicek di server)
-- * setiap pemakaian tercatat di log aktivitas
-- Aman dijalankan berulang kali.
-- =====================================================================
alter table pelanggan add column if not exists kode_member text;
alter table pelanggan add column if not exists member_aktif boolean not null default false;
alter table pelanggan add column if not exists member_sejak timestamptz;
create unique index if not exists pelanggan_kode_member on pelanggan(kode_member) where kode_member is not null;
alter table produk add column if not exists harga_member numeric(14,0);
alter table transaksi add column if not exists member_id uuid references pelanggan(id);
alter table servis add column if not exists member_id uuid references pelanggan(id);

-- nomor HP disamakan: hanya angka, 62xxx -> 0xxx
create or replace function _hp_norm(p text) returns text language sql immutable as $$
  select case when d like '62%' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') d) x
$$;

-- cek member: kode + no WA harus cocok dan member aktif
create or replace function _member(p_kode text, p_hp text) returns pelanggan
language plpgsql stable security definer set search_path = public as $$
declare m pelanggan;
begin
  select * into m from pelanggan where kode_member = upper(trim(p_kode)) and member_aktif;
  if not found or _hp_norm(m.hp) = '' or _hp_norm(m.hp) <> _hp_norm(p_hp) then
    raise exception 'MEMBER_TIDAK_COCOK: kode member dan nomor WA tidak cocok';
  end if;
  return m;
end $$;

create or replace function cek_member(p_token uuid, p_kode text, p_hp text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf; m pelanggan;
begin
  s := _sesi(p_token);
  begin
    m := _member(p_kode, p_hp);
  exception when others then
    -- percobaan gagal dicatat (untuk mendeteksi orang yang mengaku member)
    perform _log(s.id, 'member_gagal', jsonb_build_object('kode', upper(trim(coalesce(p_kode,''))), 'hp', _hp_norm(p_hp)));
    return jsonb_build_object('ok', false);
  end;
  return jsonb_build_object('ok', true, 'id', m.id, 'nama', m.nama, 'kode', m.kode_member);
end $$;

-- owner menjadikan / mencabut member
create or replace function atur_member(p_token uuid, p_pelanggan uuid, p_aktif boolean) returns text
language plpgsql security definer set search_path = public as $$
declare s staf; m pelanggan; kd text;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into m from pelanggan where id = p_pelanggan for update;
  if not found then raise exception 'TIDAK_ADA: pelanggan tidak ditemukan'; end if;
  if p_aktif and _hp_norm(m.hp) = '' then raise exception 'HP_KOSONG: isi nomor WA pelanggan dulu'; end if;
  kd := m.kode_member;
  if p_aktif and kd is null then
    kd := 'ZM-' || lpad(((select count(*) from pelanggan where kode_member is not null) + 1)::text, 4, '0');
    while exists (select 1 from pelanggan where kode_member = kd) loop
      kd := 'ZM-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    end loop;
  end if;
  update pelanggan set kode_member = kd, member_aktif = p_aktif,
    member_sejak = case when p_aktif then coalesce(member_sejak, now()) else member_sejak end where id = m.id;
  perform _log(s.id, case when p_aktif then 'member_aktif' else 'member_cabut' end, jsonb_build_object('nama', m.nama, 'kode', kd));
  return kd;
end $$;

-- pasang member ke servis (harga member untuk sparepart)
create or replace function pasang_member_servis(p_token uuid, p_servis uuid, p_kode text, p_hp text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf; v servis; m pelanggan; n int;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_servis for update;
  if v.status in ('diambil','batal') then raise exception 'TIDAK_BOLEH: servis sudah selesai'; end if;
  m := _member(p_kode, p_hp);
  update servis set member_id = m.id where id = v.id;
  -- sparepart yang sudah terpasang ikut harga member
  update servis_sparepart sp set harga = pr.harga_member, nama = pr.nama || ' (harga member)'
    from produk pr where sp.servis_id = v.id and pr.id = sp.produk_id and not sp.gratis
      and coalesce(pr.harga_member, 0) > 0 and pr.harga_member < sp.harga;
  get diagnostics n = row_count;
  perform _log(s.id, 'harga_member', jsonb_build_object('nomor', v.nomor, 'member', m.nama, 'kode', m.kode_member, 'sparepart', n));
  return jsonb_build_object('nama', m.nama, 'kode', m.kode_member);
end $$;

-- harga member diisi owner lewat produk
create or replace function simpan_harga_member(p_token uuid, p_produk uuid, p_harga numeric) returns void
language plpgsql security definer set search_path = public as $$
declare s staf; lama numeric;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select harga_member into lama from produk where id = p_produk;
  update produk set harga_member = nullif(p_harga, 0), diubah = now() where id = p_produk;
  perform _log(s.id, 'harga_member_produk', jsonb_build_object('produk_id', p_produk, 'lama', lama, 'baru', nullif(p_harga, 0)));
end $$;

-- penjualan dengan dukungan member
drop function if exists buat_transaksi(uuid, jsonb, numeric, text, text, text, numeric, text);
create or replace function buat_transaksi(p_token uuid, p_items jsonb, p_bayar numeric, p_metode text,
  p_pelanggan_nama text default null, p_pelanggan_hp text default null, p_diskon numeric default 0, p_catatan text default '',
  p_member_kode text default null, p_member_hp text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s staf; tid uuid; nomor text; it jsonb; pr produk; q int; pg pengaturan;
  sub numeric := 0; dsk numeric := 0; tot numeric; mdl numeric := 0; diskon_baris numeric; pm promo;
  gar int; ada boolean; mb pelanggan; hj numeric; hemat numeric := 0;
begin
  s := _sesi(p_token);
  if s.peran not in ('owner','kasir') then raise exception 'TIDAK_BOLEH: hanya kasir/owner yang bisa berjualan'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'KERANJANG_KOSONG'; end if;
  if coalesce(p_diskon,0) > 0 and s.peran <> 'owner' then raise exception 'KHUSUS_OWNER: diskon manual hanya oleh owner'; end if;
  select * into pg from pengaturan where id = 1;
  if nullif(trim(coalesce(p_member_kode,'')),'') is not null then mb := _member(p_member_kode, p_member_hp); end if;
  nomor := _nomor('TR');
  insert into transaksi(nomor, staf_id, pelanggan_id, member_id, metode, catatan)
  values (nomor, s.id, coalesce(mb.id, _pelanggan(p_pelanggan_nama, p_pelanggan_hp)), mb.id, coalesce(p_metode,'tunai'), coalesce(p_catatan,''))
  returning id into tid;

  -- item yang dibeli
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'qty')::int;
    if q is null or q <= 0 then raise exception 'QTY_TIDAK_VALID'; end if;
    select * into pr from produk where id = (it->>'produk_id')::uuid and aktif;
    if not found then raise exception 'PRODUK_TIDAK_ADA'; end if;
    -- harga member hanya bila member terverifikasi (kode + no WA cocok)
    hj := pr.harga_jual;
    if mb.id is not null and coalesce(pr.harga_member, 0) > 0 and pr.harga_member < pr.harga_jual then
      hemat := hemat + (pr.harga_jual - pr.harga_member) * q; hj := pr.harga_member;
    end if;
    -- promo diskon terbaik untuk produk ini
    diskon_baris := 0;
    select * into pm from promo p where _promo_berlaku(p) and p.jenis in ('diskon_persen','diskon_nominal')
      and ((p.syarat = 'produk' and p.syarat_produk_id = pr.id) or (p.syarat = 'kategori' and p.syarat_kategori_id = pr.kategori_id))
      and q >= p.min_qty
      order by case when p.jenis = 'diskon_persen' then hj * p.nilai / 100 else p.nilai end desc limit 1;
    if found then
      diskon_baris := least(hj, round(case when pm.jenis = 'diskon_persen' then hj * pm.nilai / 100 else pm.nilai end)) * q;
    end if;
    gar := coalesce(pr.garansi_hari, pg.garansi_jual_hari);
    insert into transaksi_item(transaksi_id, produk_id, nama, qty, harga, harga_beli, diskon, subtotal, promo_id, garansi_hari)
    values (tid, pr.id, pr.nama, q, hj, pr.harga_beli, diskon_baris, hj * q - diskon_baris,
            case when diskon_baris > 0 then pm.id end, gar);
    perform _ubah_stok(pr.id, -q, 'jual', nomor, s.id);
    sub := sub + hj * q; dsk := dsk + diskon_baris; mdl := mdl + pr.harga_beli * q;
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
  if mb.id is not null then
    perform _log(s.id, 'harga_member', jsonb_build_object('nomor', nomor, 'member', mb.nama, 'kode', mb.kode_member, 'hemat', hemat));
  end if;
  return jsonb_build_object('id', tid, 'nomor', nomor, 'total', tot, 'member', mb.nama, 'hemat', hemat);
end $$;

create or replace function tambah_sparepart_servis(p_token uuid, p_servis uuid, p_produk uuid, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare s staf; v servis; pr produk; hj numeric;
begin
  s := _sesi(p_token);
  select * into v from servis where id = p_servis;
  if v.status in ('diambil','batal') then raise exception 'TIDAK_BOLEH: servis sudah selesai'; end if;
  select * into pr from produk where id = p_produk and aktif;
  if not found then raise exception 'PRODUK_TIDAK_ADA'; end if;
  hj := case when v.member_id is not null and coalesce(pr.harga_member, 0) > 0 and pr.harga_member < pr.harga_jual then pr.harga_member else pr.harga_jual end;
  insert into servis_sparepart(servis_id, produk_id, nama, qty, harga, harga_beli, staf_id)
  values (p_servis, pr.id, pr.nama || case when hj < pr.harga_jual then ' (harga member)' else '' end, p_qty, hj, pr.harga_beli, s.id);
  perform _ubah_stok(pr.id, -p_qty, 'servis', v.nomor, s.id);
  insert into servis_log(servis_id, status, catatan, staf_id) values (p_servis, v.status, 'Sparepart: ' || pr.nama || ' x' || p_qty, s.id);
end $$;

revoke execute on function _member(text, text), _hp_norm(text) from public, anon, authenticated;
revoke execute on function cek_member(uuid,text,text), atur_member(uuid,uuid,boolean), pasang_member_servis(uuid,uuid,text,text),
  simpan_harga_member(uuid,uuid,numeric), buat_transaksi(uuid,jsonb,numeric,text,text,text,numeric,text,text,text) from public, anon;
grant execute on function cek_member(uuid,text,text), atur_member(uuid,uuid,boolean), pasang_member_servis(uuid,uuid,text,text),
  simpan_harga_member(uuid,uuid,numeric), buat_transaksi(uuid,jsonb,numeric,text,text,text,numeric,text,text,text),
  tambah_sparepart_servis(uuid,uuid,uuid,int) to authenticated;

-- kolom baru ikut boleh dibaca (tabel produk & transaksi memakai izin per kolom sejak SQL 003)
grant select (harga_member) on produk to authenticated;
grant select (member_id) on transaksi to authenticated;
