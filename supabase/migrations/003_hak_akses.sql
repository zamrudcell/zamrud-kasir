-- =====================================================================
-- ZAMRUD KASIR — 003: hak akses owner vs karyawan
-- * karyawan boleh menambah produk BARU (beserta harganya) & stok masuk
-- * mengubah produk/harga yang sudah ada tetap khusus owner
-- * modal / harga beli & pengeluaran dikunci di database: hanya owner
-- Aman dijalankan berulang kali.
-- =====================================================================

-- ---------- apakah permintaan ini datang dari owner? (token sesi di header x-staf-token)
create or replace function _owner_req() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare tk uuid;
begin
  begin
    tk := nullif(current_setting('request.headers', true)::json->>'x-staf-token', '')::uuid;
  exception when others then return false;
  end;
  if tk is null or not _akun_sah() then return false; end if;
  return exists (select 1 from staf_sesi ss join staf s on s.id = ss.staf_id
    where ss.token = tk and ss.selesai is null and ss.terakhir > now() - interval '15 minutes'
      and s.peran = 'owner' and s.aktif);
end $$;

-- ---------- tabel khusus owner: pengeluaran, riwayat harga, log aktivitas
do $$
declare t text;
begin
  foreach t in array array['pengeluaran','harga_log','log_aktivitas'] loop
    execute format('drop policy if exists baca on %I', t);
    execute format('create policy baca on %I for select to authenticated using (_owner_req())', t);
  end loop;
end $$;

-- ---------- kolom modal / harga beli tidak bisa dibaca langsung
do $$
declare r record; kol text;
begin
  for r in select * from (values ('produk','harga_beli'), ('transaksi','modal'), ('transaksi_item','harga_beli'),
                                 ('servis_sparepart','harga_beli'), ('opname_item','harga_beli')) v(tabel, rahasia) loop
    select string_agg(quote_ident(column_name), ',' order by ordinal_position) into kol
      from information_schema.columns where table_schema = 'public' and table_name = r.tabel and column_name <> r.rahasia;
    execute format('revoke select on table %I from authenticated', r.tabel);
    execute format('grant select (%s) on table %I to authenticated', kol, r.tabel);
  end loop;
end $$;

-- view stok menipis tanpa harga beli
drop view if exists v_stok_menipis;
create view v_stok_menipis with (security_invoker = true) as
  select p.id, p.kode, p.barcode, p.nama, p.kategori_id, p.harga_jual, p.stok, p.stok_minimum, p.satuan, p.aktif,
    coalesce(p.stok_minimum, (select stok_minimum_default from pengaturan where id = 1)) as batas
  from produk p
  where p.aktif and p.stok <= coalesce(p.stok_minimum, (select stok_minimum_default from pengaturan where id = 1));
grant select on v_stok_menipis to authenticated;
revoke all on v_stok_menipis from anon;

-- ---------- owner mengambil modal / harga beli lewat fungsi ini
create or replace function data_modal(p_token uuid, p_tabel text, p_ids text[] default null)
returns table(id text, nilai numeric) language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if p_tabel = 'produk' then
    return query select p.id::text, p.harga_beli from produk p where p_ids is null or p.id::text = any(p_ids);
  elsif p_tabel = 'transaksi' then
    return query select t.id::text, t.modal from transaksi t where t.id::text = any(p_ids);
  elsif p_tabel = 'opname_item' then
    return query select o.produk_id::text, o.harga_beli from opname_item o where o.opname_id::text = any(p_ids);
  else
    raise exception 'TABEL_TIDAK_DIKENAL';
  end if;
end $$;

-- ---------- produk: karyawan boleh menambah produk BARU, ubah produk lama khusus owner
create or replace function simpan_produk(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; pid uuid := nullif(p_data->>'id','')::uuid; lama produk; bc text; kd text; stok_awal int;
begin
  s := _sesi(p_token);
  if pid is not null then perform _wajib_owner(s); end if;
  bc := nullif(trim(coalesce(p_data->>'barcode','')), '');
  kd := nullif(upper(trim(coalesce(p_data->>'kode',''))), '');
  if pid is null then
    if kd is null then
      loop
        kd := 'BRG-' || lpad((select count(*) + 1 + floor(random() * 10)::int from produk)::text, 4, '0');
        exit when not exists (select 1 from produk where kode = kd);
      end loop;
    end if;
    if bc is null then
      loop
        bc := _ean13('20' || lpad((floor(random() * 1e10))::bigint::text, 10, '0'));
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
    insert into harga_log(produk_id, beli_lama, beli_baru, jual_lama, jual_baru, staf_id)
    select pid, null, harga_beli, null, harga_jual, s.id from produk where id = pid;
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
  perform _log(s.id, case when nullif(p_data->>'id','') is null then 'tambah_produk' else 'simpan_produk' end, p_data);
  return pid;
end $$;

-- ---------- stok masuk: semua karyawan boleh; ganti harga beli khusus owner
create or replace function stok_masuk(p_token uuid, p_produk uuid, p_qty int, p_harga_beli numeric, p_ket text)
returns void language plpgsql security definer set search_path = public as $$
declare s staf;
begin
  s := _sesi(p_token);
  if p_qty <= 0 then raise exception 'QTY_HARUS_POSITIF'; end if;
  perform _ubah_stok(p_produk, p_qty, 'masuk', coalesce(p_ket,'barang masuk'), s.id);
  if p_harga_beli is not null and p_harga_beli > 0 and s.peran = 'owner' then
    update produk set harga_beli = p_harga_beli where id = p_produk;
  end if;
  perform _log(s.id, 'stok_masuk', jsonb_build_object('produk_id', p_produk, 'qty', p_qty, 'ket', p_ket));
end $$;

revoke execute on function _owner_req(), data_modal(uuid,text,text[]) from public, anon;
grant execute on function _owner_req(), data_modal(uuid,text,text[]), simpan_produk(uuid,jsonb),
  stok_masuk(uuid,uuid,int,numeric,text) to authenticated;
