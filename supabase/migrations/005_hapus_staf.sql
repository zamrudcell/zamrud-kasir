-- =====================================================================
-- ZAMRUD KASIR — 005: hapus karyawan (khusus owner)
-- * belum punya riwayat (transaksi/servis/stok/dll) -> dihapus permanen
-- * sudah punya riwayat -> dinonaktifkan & diarsipkan, riwayat tetap utuh
-- Aman dijalankan berulang kali.
-- =====================================================================
alter table staf add column if not exists diarsip timestamptz;

create or replace function hapus_staf(p_token uuid, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s staf; t staf; hasil text;
begin
  s := _sesi(p_token); perform _wajib_owner(s);
  select * into t from staf where id = p_id;
  if not found then raise exception 'TIDAK_ADA: karyawan tidak ditemukan'; end if;
  if t.id = s.id then raise exception 'DITOLAK: tidak bisa menghapus akun Anda sendiri'; end if;
  if t.peran = 'owner' and not exists (select 1 from staf where peran = 'owner' and aktif and diarsip is null and id <> t.id) then
    raise exception 'DITOLAK: harus ada minimal satu owner';
  end if;
  begin
    update log_aktivitas set staf_id = null,
      detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('staf_dihapus', t.nama || ' (' || t.kode || ')')
      where staf_id = t.id;
    delete from staf where id = t.id;
    hasil := 'dihapus';
  exception when foreign_key_violation then
    update staf set aktif = false, diarsip = now() where id = t.id;
    update staf_sesi set selesai = now() where staf_id = t.id and selesai is null;
    hasil := 'diarsip';
  end;
  perform _log(s.id, 'hapus_staf', jsonb_build_object('kode', t.kode, 'nama', t.nama, 'hasil', hasil));
  return hasil;
end $$;

-- karyawan yang diarsip tidak bisa masuk walau diaktifkan lewat cara lain
create or replace function _cek_arsip() returns trigger language plpgsql as $$
begin
  if new.diarsip is not null then new.aktif := false; end if;
  return new;
end $$;
drop trigger if exists staf_arsip on staf;
create trigger staf_arsip before update on staf for each row execute function _cek_arsip();

revoke execute on function hapus_staf(uuid, uuid) from public, anon;
grant execute on function hapus_staf(uuid, uuid) to authenticated;
