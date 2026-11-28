-- =====================================================================
-- ZAMRUD KASIR — 009: owner melihat ukuran database (batas paket gratis 500 MB)
-- Hanya membaca ukuran, tidak mengubah data. Aman dijalankan berulang kali.
-- =====================================================================
create or replace function ukuran_database(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s staf; total bigint; tabel jsonb;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  total := pg_database_size(current_database());
  select coalesce(jsonb_agg(jsonb_build_object('nama', t.relname, 'byte', t.ukuran) order by t.ukuran desc), '[]') into tabel
  from (select c.relname, pg_total_relation_size(c.oid) ukuran from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 5) t;
  return jsonb_build_object('terpakai', total, 'batas', 500::bigint * 1024 * 1024, 'tabel', tabel);
end $$;
revoke execute on function ukuran_database(uuid) from public, anon;
grant execute on function ukuran_database(uuid) to authenticated;
