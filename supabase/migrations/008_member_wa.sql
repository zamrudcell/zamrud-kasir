-- =====================================================================
-- ZAMRUD KASIR — 008: member cukup dicek dengan NOMOR WA
-- (kode member tetap ada di dalam sistem, tapi tidak perlu diketik)
-- Aman dijalankan berulang kali. Butuh SQL 006.
-- =====================================================================
create or replace function _member(p_kode text, p_hp text) returns pelanggan
language plpgsql stable security definer set search_path = public as $$
declare m pelanggan; v_hp text := _hp_norm(p_hp);
begin
  if length(v_hp) < 9 then raise exception 'MEMBER_TIDAK_COCOK: nomor WA tidak terdaftar sebagai member'; end if;
  select * into m from pelanggan where member_aktif and _hp_norm(hp) = v_hp order by member_sejak limit 1;
  if not found then raise exception 'MEMBER_TIDAK_COCOK: nomor WA tidak terdaftar sebagai member'; end if;
  return m;
end $$;
revoke execute on function _member(text, text) from public, anon, authenticated;
