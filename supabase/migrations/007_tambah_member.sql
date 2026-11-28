-- =====================================================================
-- ZAMRUD KASIR — 007: owner menambah pelanggan member langsung
-- (tanpa harus menunggu pelanggan belanja / servis dulu)
-- Aman dijalankan berulang kali. Butuh SQL 006.
-- =====================================================================
create or replace function tambah_member(p_token uuid, p_nama text, p_hp text, p_alamat text default '', p_catatan text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s staf; v_hp text := _hp_norm(p_hp); pid uuid; kd text;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  if coalesce(trim(p_nama), '') = '' then raise exception 'NAMA_KOSONG: isi nama member'; end if;
  if length(v_hp) < 9 then raise exception 'HP_TIDAK_VALID: isi nomor WA yang benar'; end if;
  -- nomor WA sudah ada? pakai pelanggan yang sama
  select id into pid from pelanggan where _hp_norm(hp) = v_hp order by dibuat limit 1;
  if pid is null then
    insert into pelanggan(nama, hp, alamat, catatan) values (trim(p_nama), v_hp, coalesce(p_alamat, ''), coalesce(p_catatan, '')) returning id into pid;
  else
    update pelanggan set nama = trim(p_nama), alamat = coalesce(nullif(p_alamat, ''), alamat), catatan = coalesce(nullif(p_catatan, ''), catatan) where id = pid;
  end if;
  kd := atur_member(p_token, pid, true);
  return jsonb_build_object('id', pid, 'kode', kd, 'nama', trim(p_nama), 'hp', v_hp);
end $$;

revoke execute on function tambah_member(uuid, text, text, text, text) from public, anon;
grant execute on function tambah_member(uuid, text, text, text, text) to authenticated;
