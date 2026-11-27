-- =====================================================================
-- ZAMRUD KASIR — 004: sesi karyawan lebih lama (60 menit tidak dipakai)
-- Kunci layar tetap diatur owner di Pengaturan. Aman dijalankan berulang.
-- =====================================================================
create or replace function _sesi(p_token uuid) returns staf
language plpgsql security definer set search_path = public as $$
declare ss staf_sesi; s staf;
begin
  if auth.uid() is null or not _akun_sah() then
    raise exception 'AKUN_TIDAK_SAH: akun ini belum terdaftar sebagai akun toko';
  end if;
  select * into ss from staf_sesi where token = p_token and selesai is null;
  if not found then raise exception 'SESI_HABIS: silakan masuk dengan kode & PIN'; end if;
  if ss.terakhir < now() - interval '60 minutes' then
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
    where ss.token = tk and ss.selesai is null and ss.terakhir > now() - interval '60 minutes'
      and s.peran = 'owner' and s.aktif);
end $$;

-- kunci layar bawaan 2 menit terlalu cepat: jadikan 10 menit (owner tetap bisa mengubah)
alter table pengaturan alter column menit_kunci set default 10;
update pengaturan set menit_kunci = 10 where menit_kunci = 2;
