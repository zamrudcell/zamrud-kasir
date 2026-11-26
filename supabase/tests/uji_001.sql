-- Uji fungsi utama (dijalankan di database uji lokal, BUKAN di Supabase asli)
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111','toko@zamrud.id'),('22222222-2222-2222-2222-222222222222','orang@lain.id');
set role authenticated;
-- helper: harapkan error
create or replace function pg_temp.harus_gagal(q text, pola text) returns text language plpgsql as $$
begin execute q; raise exception 'SEHARUSNYA GAGAL: %', q;
exception when others then
  if sqlerrm like 'SEHARUSNYA GAGAL%' then raise; end if;
  if sqlerrm not ilike '%'||pola||'%' then raise exception 'error beda: % (harap %)', sqlerrm, pola; end if;
  return 'OK gagal: '||left(sqlerrm,60);
end $$;

-- orang asing (belum login) tidak bisa apa-apa
select set_config('request.jwt.claim.sub','',false);
select pg_temp.harus_gagal($$select masuk_staf('X','123456')$$,'AKUN_TIDAK_SAH');

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select daftarkan_akun_pertama() as akun1, status_aplikasi();
select buat_owner_pertama('OWN','Habib Anis','111111');
select pg_temp.harus_gagal($$select buat_owner_pertama('OWN2','x','111111')$$,'SUDAH_ADA');

-- akun lain tidak sah
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select daftarkan_akun_pertama() as akun2_sah;
select pg_temp.harus_gagal($$select masuk_staf('OWN','111111')$$,'AKUN_TIDAK_SAH');
select count(*) as akun2_lihat_produk from produk;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select set_config('t.own', (masuk_staf('own','111111')->>'token'), false);

-- kasir A di shift sekarang, B di luar shift
select set_config('t.a_id', simpan_staf(current_setting('t.own')::uuid, '{"kode":"ZC01","nama":"Ali","peran":"kasir","pin":"222222"}')::text, false);
select set_config('t.b_id', simpan_staf(current_setting('t.own')::uuid, '{"kode":"ZC02","nama":"Budi","peran":"kasir","pin":"333333"}')::text, false);
select set_config('t.c_id', simpan_staf(current_setting('t.own')::uuid, '{"kode":"ZC03","nama":"Candra","peran":"teknisi","pin":"444444"}')::text, false);
select simpan_jadwal(current_setting('t.own')::uuid, current_setting('t.a_id')::uuid,
  jsonb_build_array(jsonb_build_object('hari', extract(dow from _sekarang())::int, 'jam_mulai','00:00','jam_selesai','23:59:59')));
select simpan_jadwal(current_setting('t.own')::uuid, current_setting('t.c_id')::uuid,
  jsonb_build_array(jsonb_build_object('hari', extract(dow from _sekarang())::int, 'jam_mulai','00:00','jam_selesai','23:59:59')));
select simpan_jadwal(current_setting('t.own')::uuid, current_setting('t.b_id')::uuid,
  jsonb_build_array(jsonb_build_object('hari', (extract(dow from _sekarang())::int + 1) % 7, 'jam_mulai','08:00','jam_selesai','16:00')));
select pg_temp.harus_gagal($$select masuk_staf('ZC02','333333')$$,'DILUAR_SHIFT');
select pg_temp.harus_gagal($$select masuk_staf('ZC01','999999')$$,'PIN_SALAH');
select set_config('t.a', (masuk_staf('ZC01','222222')->>'token'), false);
select set_config('t.c', (masuk_staf('ZC03','444444')->>'token'), false);

-- tulis langsung ke tabel & baca PIN: harus ditolak
select pg_temp.harus_gagal($$insert into transaksi(nomor, staf_id) values ('X', '$$||current_setting('t.a_id')||$$')$$,'permission denied');
select pg_temp.harus_gagal($$update produk set harga_jual = 1$$,'permission denied');
select pg_temp.harus_gagal($$select * from staf_pin$$,'permission denied');
select pg_temp.harus_gagal($$select * from staf_sesi$$,'permission denied');
select pg_temp.harus_gagal($$select _sesi('$$||current_setting('t.a')||$$')$$,'permission denied');

-- kasir tidak boleh kelola produk
select pg_temp.harus_gagal($$select simpan_produk('$$||current_setting('t.a')||$$','{"nama":"x"}')$$,'KHUSUS_OWNER');

-- produk
select set_config('t.kat', simpan_kategori(current_setting('t.own')::uuid, null, 'Aksesoris')::text, false);
select set_config('t.p1', simpan_produk(current_setting('t.own')::uuid, jsonb_build_object('nama','Holder HP','kategori_id',current_setting('t.kat'),'harga_beli',10000,'harga_jual',25000,'stok',10))::text, false);
select set_config('t.p2', simpan_produk(current_setting('t.own')::uuid, '{"nama":"Kaki Kaki Pasang","harga_beli":5000,"harga_jual":15000,"stok":5,"garansi_hari":0}')::text, false);
select set_config('t.lcd', simpan_produk(current_setting('t.own')::uuid, '{"nama":"LCD Oppo A5","harga_beli":150000,"harga_jual":300000,"stok":2}')::text, false);
select kode, barcode, stok from produk order by kode;

-- promo: beli 2 holder gratis 1 kaki kaki; servis LCD gratis kaki kaki
select simpan_promo(current_setting('t.own')::uuid, jsonb_build_object('nama','Beli 2 Holder gratis Kaki','jenis','gratis','syarat','produk','syarat_produk_id',current_setting('t.p1'),'min_qty',2,'hadiah_produk_id',current_setting('t.p2'),'hadiah_qty',1));
select simpan_promo(current_setting('t.own')::uuid, jsonb_build_object('nama','Diskon holder 10%','jenis','diskon_persen','syarat','produk','syarat_produk_id',current_setting('t.p1'),'min_qty',1,'nilai',10));
select simpan_promo(current_setting('t.own')::uuid, jsonb_build_object('nama','Ganti LCD gratis kaki','jenis','gratis','syarat','servis','syarat_kata_servis','LCD','hadiah_produk_id',current_setting('t.p2'),'hadiah_qty',1));

-- transaksi oleh A
select pg_temp.harus_gagal($$select buat_transaksi('$$||current_setting('t.a')||$$', '[{"produk_id":"$$||current_setting('t.p1')||$$","qty":1}]', 100000, 'tunai', null, null, 5000)$$,'KHUSUS_OWNER');
select pg_temp.harus_gagal($$select buat_transaksi('$$||current_setting('t.c')||$$', '[{"produk_id":"$$||current_setting('t.p1')||$$","qty":1}]', 100000, 'tunai')$$,'hanya kasir');
select pg_temp.harus_gagal($$select buat_transaksi('$$||current_setting('t.a')||$$', '[{"produk_id":"$$||current_setting('t.p1')||$$","qty":2}]', 1000, 'tunai')$$,'UANG_KURANG');
select set_config('t.tr', (buat_transaksi(current_setting('t.a')::uuid, jsonb_build_array(jsonb_build_object('produk_id',current_setting('t.p1'),'qty',2)), 50000, 'tunai', 'Julit', '0812-3456')->>'id'), false);
select t.nomor, s.nama kasir, t.subtotal, t.diskon, t.total, t.modal, t.bayar, t.kembali from transaksi t join staf s on s.id=t.staf_id;
select nama, qty, harga, diskon, subtotal, gratis, garansi_hari from transaksi_item order by gratis;
select nama, stok from produk order by kode;
-- gagal (stok rollback) jika stok kurang
select pg_temp.harus_gagal($$select buat_transaksi('$$||current_setting('t.a')||$$', '[{"produk_id":"$$||current_setting('t.lcd')||$$","qty":5}]', 9999999, 'tunai')$$,'STOK_KURANG');
select stok as lcd_tetap_2 from produk where id = current_setting('t.lcd')::uuid;

-- batal oleh kasir ditolak; retur oleh kasir -> menunggu owner
select pg_temp.harus_gagal($$select batal_transaksi('$$||current_setting('t.a')||$$','$$||current_setting('t.tr')||$$','x')$$,'KHUSUS_OWNER');
select set_config('t.rt', (ajukan_retur(current_setting('t.a')::uuid, current_setting('t.tr')::uuid,
  jsonb_build_array(jsonb_build_object('transaksi_item_id',(select id from transaksi_item where not gratis limit 1),'qty',1)), 'rusak')->>'id'), false);
select pg_temp.harus_gagal($$select putuskan_retur('$$||current_setting('t.a')||$$','$$||current_setting('t.rt')||$$',true)$$,'KHUSUS_OWNER');
select putuskan_retur(current_setting('t.own')::uuid, current_setting('t.rt')::uuid, true);
select nomor, total, status from retur;
select stok as holder_stok_9 from produk where id = current_setting('t.p1')::uuid;
select pg_temp.harus_gagal($$select ajukan_retur('$$||current_setting('t.a')||$$','$$||current_setting('t.tr')||$$', '[{"transaksi_item_id":"$$||(select id from transaksi_item where not gratis limit 1)||$$","qty":2}]','x')$$,'MELEBIHI');

-- servis
select set_config('t.sv', (buat_servis(current_setting('t.a')::uuid, '{"nama":"Julit","hp":"08123456","merek":"Oppo","tipe":"A5","imei":"861234567890123","jenis_servis":"Ganti LCD","keluhan":"layar pecah","estimasi_biaya":350000,"dp":50000}')->>'id'), false);
select ubah_status_servis(current_setting('t.c')::uuid, current_setting('t.sv')::uuid, 'dikerjakan');
select tambah_sparepart_servis(current_setting('t.c')::uuid, current_setting('t.sv')::uuid, current_setting('t.lcd')::uuid, 1);
select ubah_servis(current_setting('t.c')::uuid, current_setting('t.sv')::uuid, '{"biaya_jasa":50000}');
select pg_temp.harus_gagal($$select ambil_servis('$$||current_setting('t.a')||$$','$$||current_setting('t.sv')||$$')$$,'BELUM_SIAP');
select ubah_status_servis(current_setting('t.c')::uuid, current_setting('t.sv')::uuid, 'siap_diambil');
select ambil_servis(current_setting('t.a')::uuid, current_setting('t.sv')::uuid, 200000) as tagihan_belum_lunas;
select nomor, status, nama_penerima, nama_teknisi, total_tagihan, dibayar, total_tagihan - dibayar as sisa from v_servis;
select nama, qty, gratis from servis_sparepart;
select count(*) as riwayat_imei from servis where imei = '861234567890123';

-- opname
select set_config('t.op', buat_opname(current_setting('t.a')::uuid, 'Opname Nov 2026')::text, false);
select isi_opname(current_setting('t.a')::uuid, current_setting('t.op')::uuid, current_setting('t.p1')::uuid, 7);
select pg_temp.harus_gagal($$select final_opname('$$||current_setting('t.a')||$$','$$||current_setting('t.op')||$$')$$,'KHUSUS_OWNER');
select final_opname(current_setting('t.own')::uuid, current_setting('t.op')::uuid) as disesuaikan;
select nama, stok from produk order by kode;
select count(*) as menipis from v_stok_menipis;

-- tugas & bonus
select set_config('t.tg', simpan_tugas(current_setting('t.own')::uuid, jsonb_build_object('staf_id',current_setting('t.a_id'),'judul','Rapikan etalase','bonus',10000))::text, false);
select pg_temp.harus_gagal($$select selesaikan_tugas('$$||current_setting('t.c')||$$','$$||current_setting('t.tg')||$$')$$,'bukan milik');
select selesaikan_tugas(current_setting('t.a')::uuid, current_setting('t.tg')::uuid);
select nilai_tugas(current_setting('t.own')::uuid, current_setting('t.tg')::uuid, true);
select simpan_bonus_aturan(current_setting('t.own')::uuid, '[{"peran":"kasir","jenis":"per_transaksi","nilai":1000},{"peran":"kasir","jenis":"persen_penjualan","nilai":1},{"peran":"teknisi","jenis":"persen_jasa_servis","nilai":20}]');
select kode, nama, jml_transaksi, penjualan, jml_servis, jasa_servis, bonus_tugas, bonus_total from laporan_bonus(current_setting('t.own')::uuid, _sekarang()::date - 30, _sekarang()::date);
select count(*) as kasir_A_hanya_lihat_dirinya from laporan_bonus(current_setting('t.a')::uuid, _sekarang()::date - 30, _sekarang()::date);

-- harga massal & nonaktif staf memutus sesi
select ubah_harga_massal(current_setting('t.own')::uuid, null, 'persen', 10, 500) as produk_naik;
select simpan_staf(current_setting('t.own')::uuid, jsonb_build_object('id',current_setting('t.a_id'),'kode','ZC01','nama','Ali','aktif',false));
select pg_temp.harus_gagal($$select cek_sesi('$$||current_setting('t.a')||$$')$$,'SESI_HABIS');
select count(*) as jml_log from log_aktivitas;
select 'SEMUA UJI LULUS ✅';
