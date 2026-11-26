# ZAMRUD KASIR

Aplikasi kasir & servis **Zamrud Cell** — Service HP, iPhone, Android | Sparepart & Aksesoris.

## Isi
- Login akun toko (email & sandi) → karyawan masuk dengan **kode + PIN** sesuai jadwal shift
- Kasir & nota (2 rangkap: konsumen + toko, dengan garansi)
- Servis: Antri → Dikerjakan → Tunggu Sparepart → Siap Diambil → Diambil / Belum Lunas
- Stok, barcode, stok opname, peringatan stok menipis
- Retur (disetujui owner), promo harga & barang gratis (diatur owner)
- Tugas shift & bonus karyawan, laporan laba rugi, log aktivitas

## Database
`supabase/migrations/` — jalankan berurutan di Supabase > SQL Editor (aman diulang).
`supabase/tests/` — uji otomatis (untuk database uji lokal, bukan Supabase asli).

## Keamanan
- Aplikasi tidak bisa menulis langsung ke tabel; semua lewat fungsi yang mewajibkan sesi karyawan.
- Nama karyawan di transaksi diambil dari sesi di server → tidak bisa atas nama orang lain.
- Jangan pernah menaruh *service_role key* atau password database di repo ini.
