-- =====================================================================
-- ZAMRUD KASIR — Migrasi 002: barcode EAN-13 + laporan dihitung di server
-- Aman dijalankan ulang. Jalankan setelah 001.
-- =====================================================================

-- barcode EAN-13 buatan toko (awalan 20 = kode internal toko)
create or replace function _ean13(p12 text) returns text
language plpgsql immutable as $$
declare s int := 0; i int;
begin
  for i in 1..12 loop s := s + substr(p12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end; end loop;
  return p12 || ((10 - s % 10) % 10)::text;
end $$;

create or replace function simpan_produk(p_token uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare s staf; pid uuid := nullif(p_data->>'id','')::uuid; lama produk; bc text; kd text; stok_awal int;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
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

-- ---------------- LAPORAN LABA RUGI (owner) ----------------
create or replace function laporan_laba(p_token uuid, p_dari date, p_sampai date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf; tz text := (select zona_waktu from pengaturan where id = 1); r jsonb;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  with trx as (
    select * from transaksi where status = 'selesai' and (dibuat at time zone tz)::date between p_dari and p_sampai
  ), rt as (
    select r.* from retur r where r.status = 'disetujui' and (r.diputus_waktu at time zone tz)::date between p_dari and p_sampai
  ), sv as (
    select v.* from servis v where v.status = 'diambil' and (v.diambil_waktu at time zone tz)::date between p_dari and p_sampai
  )
  select jsonb_build_object(
    'jml_transaksi', (select count(*) from trx),
    'penjualan', (select coalesce(sum(total),0) from trx),
    'modal_jual', (select coalesce(sum(modal),0) from trx),
    'retur', (select coalesce(sum(total),0) from rt),
    'modal_kembali', (select coalesce(sum(ti.harga_beli * ri.qty),0) from retur_item ri join rt on rt.id = ri.retur_id
                      join transaksi_item ti on ti.id = ri.transaksi_item_id where ri.kembali_stok),
    'jml_servis', (select count(*) from sv),
    'jasa', (select coalesce(sum(biaya_jasa),0) from sv),
    'jual_sparepart', (select coalesce(sum(case when sp.gratis then 0 else sp.harga * sp.qty end),0) from servis_sparepart sp join sv on sv.id = sp.servis_id),
    'modal_sparepart', (select coalesce(sum(sp.harga_beli * sp.qty),0) from servis_sparepart sp join sv on sv.id = sp.servis_id),
    'belum_lunas', (select coalesce(sum(greatest(0, sv.biaya_jasa
                      + coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = sv.id),0)
                      - coalesce((select sum(nominal) from servis_bayar where servis_id = sv.id),0))),0) from sv),
    'pengeluaran', (select coalesce(sum(nominal),0) from pengeluaran where tanggal between p_dari and p_sampai),
    'harian', (select coalesce(jsonb_agg(jsonb_build_object('tgl', d::date, 'nilai', coalesce(x.n,0)) order by d), '[]'::jsonb)
               from generate_series(p_dari, least(p_sampai, p_dari + 92), interval '1 day') d
               left join (select (dibuat at time zone tz)::date t, sum(total) n from trx group by 1) x on x.t = d::date)
  ) into r;
  return r;
end $$;

create or replace function laporan_barang(p_token uuid, p_dari date, p_sampai date)
returns table(nama text, terjual bigint, gratis bigint, penjualan numeric, modal numeric)
language plpgsql security definer set search_path = public as $$
declare s staf; tz text := (select zona_waktu from pengaturan where id = 1);
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  return query
    select coalesce(p.nama, replace(ti.nama, ' (GRATIS)', '')) as nama,
      coalesce(sum(ti.qty) filter (where not ti.gratis), 0)::bigint,
      coalesce(sum(ti.qty) filter (where ti.gratis), 0)::bigint,
      coalesce(sum(ti.subtotal), 0), coalesce(sum(ti.harga_beli * ti.qty), 0)
    from transaksi_item ti join transaksi t on t.id = ti.transaksi_id
    left join produk p on p.id = ti.produk_id
    where t.status = 'selesai' and (t.dibuat at time zone tz)::date between p_dari and p_sampai
    group by 1 order by 4 desc;
end $$;

create or replace function laporan_pelanggan(p_token uuid, p_dari date, p_sampai date)
returns table(pelanggan_id uuid, nama text, hp text, jml_belanja bigint, jml_servis bigint, total numeric, laba numeric)
language plpgsql security definer set search_path = public as $$
declare s staf; tz text := (select zona_waktu from pengaturan where id = 1);
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  return query
  with a as (
    select t.pelanggan_id pid, 1 b, 0 v, t.total tot, t.total - t.modal lb from transaksi t
      where t.status = 'selesai' and (t.dibuat at time zone tz)::date between p_dari and p_sampai
    union all
    select v.pelanggan_id, 0, 1,
      v.biaya_jasa + coalesce((select sum(case when gratis then 0 else harga * qty end) from servis_sparepart where servis_id = v.id),0),
      v.biaya_jasa + coalesce((select sum(case when gratis then -harga_beli * qty else (harga - harga_beli) * qty end) from servis_sparepart where servis_id = v.id),0)
      from servis v where v.status = 'diambil' and (v.diambil_waktu at time zone tz)::date between p_dari and p_sampai
  )
  select a.pid, coalesce(pl.nama, 'Pelanggan umum'), pl.hp, sum(a.b)::bigint, sum(a.v)::bigint, sum(a.tot), sum(a.lb)
  from a left join pelanggan pl on pl.id = a.pid
  group by a.pid, pl.nama, pl.hp order by 6 desc;
end $$;

revoke execute on function laporan_laba(uuid,date,date), laporan_barang(uuid,date,date), laporan_pelanggan(uuid,date,date) from public, anon;
grant execute on function laporan_laba(uuid,date,date), laporan_barang(uuid,date,date), laporan_pelanggan(uuid,date,date) to authenticated;
revoke execute on function _ean13(text) from public, anon, authenticated;

select 'ZAMRUD KASIR: migrasi 002 selesai ✅' as hasil;
