# Hasil Pengujian & Batasan

Diuji pada **25 Oktober 2026**, di Linux (Node 22.22) dengan Chromium headless. **Belum diuji di Windows fisik** (lihat batasan).

## Tes otomatis — `npm test` → 24 lulus, 0 gagal

**`tests/loja.test.js` (18 tes, server + database nyata, mode sandbox)**
| # | Yang diuji | Hasil |
|---|---|---|
| 1 | Registrasi, validasi (nama/senha/konfirmasi), password tersimpan sebagai hash bcrypt | Lulus |
| 2 | Email duplikat (termasuk beda huruf besar/kecil) ditolak | Lulus |
| 3 | Login, logout, sesi hilang setelah logout, password salah; akun terkunci setelah 5 kali salah | Lulus |
| 4 | Proteksi: API akun/admin → 401 tanpa login; `/conta` & `/admin` redirect; pelanggan ke `/admin` → 403 | Lulus |
| 5 | Perubahan profil tersimpan & terbaca dari "perangkat lain"; mengirim `role:admin` di profil tidak berefek | Lulus |
| 6 | CSRF: aksi tulis tanpa/dengan token salah ditolak | Lulus |
| 7 | Pesanan: harga dari database (mengirim `price:1` diabaikan), produk tak ada/nonaktif ditolak, tidak bisa membeli yang sudah dimiliki | Lulus |
| 8 | Pembelian individual & **bundle** (semua plugin dalam bundle masuk akun), notifikasi dibuat | Lulus |
| 9 | Pembayaran **pending / recusado / cancelado** tidak memberi akses; coba bayar lagi; riwayat percobaan tersimpan; persetujuan terlambat pada pesanan batal tidak memberi akses | Lulus |
| 10 | **Webhook** tanpa/dengan tanda tangan salah → 401; event duplikat diabaikan; akses & pendapatan tidak dobel | Lulus |
| 11 | Nominal/mata uang dari gateway tidak cocok → tidak ada akses | Lulus |
| 12 | Isolasi: pengguna B tidak bisa melihat/membayar ulang/membatalkan pesanan A, tidak bisa membuka halaman sandbox A | Lulus |
| 13 | Upload: ekstensi terlarang & isi palsu ditolak, versi duplikat ditolak, file **tidak** bisa diakses lewat URL | Lulus |
| 14 | Download: ditolak sebelum bayar; token sekali pakai; token milik orang lain ditolak (meski ia punya plugin yang sama); isi file byte-per-byte identik; token gagal jika akses dicabut | Lulus |
| 15 | Pemberian manual admin: wajib konfirmasi & alasan, **bukan pendapatan**, tidak membuat pesanan palsu, notifikasi terkirim, tidak bisa diberikan dua kali | Lulus |
| 16 | Pencabutan akses (wajib alasan+konfirmasi), audit log tercatat, pelanggan tidak bisa memanggil API admin | Lulus |
| 17 | Reembolso sandbox: akses dicabut, notifikasi; nonaktifkan/aktifkan akun menjatuhkan sesi; admin tak bisa menonaktifkan diri sendiri | Lulus |
| 18 | Produk baru/edit harga/bundle/validasi; saklar promo; reset password (token sekali pakai, tidak membocorkan keberadaan email, sesi lama jatuh); ganti password; header CSP; SQL injection; file sensitif (`.env`, DB, kode server) tidak tersaji | Lulus |

**`tests/mercadopago.test.js` (6 tes — API Mercado Pago DIGANTI STUB)**
Preferensi dibuat dengan harga server; sandbox mati di mode MP; webhook tanpa/salah tanda tangan ditolak; status diambil ulang dari API MP (isi webhook palsu "approved" tidak dipercaya); pending→approved; reenvio webhook diabaikan; nominal beda tidak memberi akses; referensi tak dikenal diabaikan; error API → 500 agar MP mencoba lagi; reembolso via API + webhook mencabut akses.

**Validasi kualitas tes:** saya merusak kode secara sengaja (mematikan cek nominal; mematikan cek pemilik token download). Tes pertama langsung mendeteksi; tes kedua awalnya **lolos** karena ada lapisan lain yang menutupi, jadi saya menambahkan skenario baru lalu mutasi itu terdeteksi.

## Pengujian browser (Playwright/Chromium)
Alur lengkap berhasil: daftar → beranda (animasi 3D tampil, CSP tidak merusak, harga tampil dari server) → Comprar → carrinho → pembayaran sandbox → "Pagamento confirmado" → Meus plugins (3 kartu) → notifikasi → pedidos; pelanggan di `/admin` → "Acesso negado"; admin membuka resumo/produk/pedidos/usuários/detail usuário. Tidak ada error JavaScript. Desktop 1366px dan HP 390px: **tanpa scroll horizontal** di beranda, akun, pedidos. Screenshot dilihat manual untuk beranda, Meus plugins (desktop & HP) dan Produtos (admin); halaman lain hanya diperiksa lewat tes fungsional, bukan ditinjau satu per satu secara visual.

## Pengujian startup
Ekstrak bersih → `npm install` → seed → buat admin → `npm start` → beranda & `/api/products` 200. Produksi + sandbox atau tanpa `SESSION_SECRET` → server menolak start dengan pesan jelas. Rate-limit login aktif (percobaan ke-21 → 429).

## Batasan (jujur)
1. **Mercado Pago asli belum diuji** — tidak ada kredensial di sini. Kode mengikuti dokumentasi (Checkout Pro, `x-signature`, `/v1/payments/{id}`, refund), tapi baru diuji terhadap stub. **Wajib uji dengan kredensial TEST dan pembeli teste** sebelum menerima uang sungguhan. Format manifest tanda tangan bisa berubah di sisi MP; jika webhook asli ditolak 401, cek log dan versi dokumentasi MP.
2. **`start.bat` belum dijalankan di Windows** (hanya logikanya yang saya tiru di Linux: install, `.env`, seed, cek admin, start). Jika ada pesan error di Windows, kirimkan ke saya.
3. **Tidak ada file plugin asli** di ZIP → download tidak bisa dicoba dengan produk nyata; diuji dengan file zip dummy. Admin harus mengunggah installer.
4. **Email** (reset password) hanya diuji tanpa SMTP (link dicetak di terminal). Pengiriman SMTP sebenarnya belum diuji.
5. **Bukan Supabase/Netlify Functions.** Saya memilih Node + SQLite karena satu-satunya yang bisa saya jalankan dan uji penuh di sini dan mudah dipakai di laptop. Konsekuensi: butuh hosting Node dengan disk persisten (bukan Netlify statis), dan hanya **satu instance** server (SQLite). Row Level Security tidak berlaku; isolasi data ada di backend dan diuji.
6. Memakai modul `node:sqlite` bawaan Node yang masih berstatus *experimental* (peringatan disembunyikan; butuh Node ≥ 22.5).
7. Pesanan yang dibayar **setelah dibatalkan** ditandai tanpa memberi akses; refund-nya harus manual (tidak otomatis).
8. Tidak ada verifikasi email saat registrasi, tidak ada 2FA admin, tidak ada kupon/pajak/nota fiskal.
9. UI pelanggan & admin berbahasa **pt-BR** (bukan Indonesia); dokumentasi berbahasa Indonesia. Pesan teknis di terminal (config) berbahasa Indonesia.
10. Demo audio/video lama (sudah dinonaktifkan di situs asli) tidak dibawa; satu perbaikan teks kecil: footer "Plugins Forby Chicano" → "Plugins by Carlos Chicano".
11. Tidak ada tampilan di tablet yang diuji khusus (hanya desktop 1366px dan HP 390px).
