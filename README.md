# Line Collection — Toko Plugin Audio

Toko plugin audio digital **sungguhan**: registrasi & login, katalog, keranjang, pembayaran (Mercado Pago atau mode uji/sandbox), **Meus Plugins** (plugin otomatis masuk akun setelah pembayaran terverifikasi), download aman, notifikasi, dan dashboard admin.

Tampilan situs asli (logo, gambar plugin, animasi 3D, teks, harga) **dipertahankan**. Halaman baru (akun, checkout, admin) memakai warna dan font yang sama.

> **Bahasa:** dokumentasi ini berbahasa Indonesia. Tampilan situs untuk pelanggan tetap **Portugis-Brasil (pt-BR)** dengan harga **R$**, karena itu bahasa dan mata uang situs aslinya.

---

## 1. Apa saja yang ada di dalam

| Teknologi | Fungsi |
|---|---|
| HTML + CSS + JS biasa | Frontend (sama seperti situs asli, tanpa framework) |
| Node.js 22 + Express | Backend / API |
| SQLite (bawaan Node, 1 file) | Database — tidak perlu install apa-apa |
| Mercado Pago (REST API resmi) | Pembayaran asli (Pix, kartu, boleto, dll. sesuai akun merchant) |
| Mode **sandbox** | Simulasi pembayaran lokal untuk uji coba, tanpa uang |

```
server/        backend (rute, keamanan, logika toko, database + skema)
public/        situs: halaman utama asli + css/js + aset gambar + pages/ (akun, admin, checkout)
scripts/       buat admin
tests/         tes otomatis (24 tes)
data/          database (dibuat otomatis, TIDAK ikut ZIP)
storage/       file plugin privat (dibuat otomatis, TIDAK ikut ZIP)
arquivo-original/  arsip build lama (build.py dll.) — hanya referensi, tidak dipakai lagi
```

---

## 2. Menjalankan di laptop Windows (cara termudah)

**Sekali saja:** pasang Node.js versi **LTS (22 atau lebih baru)** dari <https://nodejs.org> (klik Next terus sampai selesai).

Lalu:

1. Ekstrak ZIP ini ke folder, misalnya `C:\LineCollection`.
2. **Klik dua kali `start.bat`.**

`start.bat` otomatis: memeriksa Node, menginstall dependensi, membuat file `.env` dengan kunci rahasia acak, membuat database + produk, meminta Anda membuat **akun admin** (ketik email & password di jendela hitam), lalu membuka <http://localhost:3000>.

Untuk berhenti: tutup jendela hitam. Untuk menyalakan lagi: klik `start.bat` lagi (data tetap tersimpan).

### Cara manual (terminal)
```bash
cd C:\LineCollection
npm install
copy .env.example .env      # lalu isi SESSION_SECRET (lihat komentar di dalam file)
npm run seed                # isi produk dan harga
npm run criar-admin         # buat admin pertama (password diketik di terminal)
npm start                   # buka http://localhost:3000
```

> Situs **tidak boleh** dibuka dengan klik dua kali `index.html`. Ia butuh server (langkah di atas).

### Membuat akun admin pertama dengan aman
Jalankan `criar-admin.bat` (atau `npm run criar-admin`). Email dan password diketik langsung; **tidak** disimpan di file mana pun (di database hanya hash bcrypt). Tidak ada akun admin bawaan. Setelah itu login di `/entrar`, lalu buka `/admin`. Pelanggan biasa tidak bisa menjadi admin dengan mengubah URL atau data profil: peran dicek di server dari database.

---

## 3. Menguji pembelian (mode sandbox)

Dengan `PAYMENT_PROVIDER=sandbox` (bawaan), tidak ada uang yang bergerak.

1. Buka <http://localhost:3000>, klik **Entrar → Criar conta**, daftar.
2. Di bagian harga, klik **Comprar** pada paket (mis. Pacote Voz) → halaman **Carrinho** → **Ir para pagamento de teste**.
3. Di halaman simulasi pilih hasil: **aprovado**, **pendente**, **recusado**, atau **cancelado**.
4. Setelah *aprovado*: buka **Minha conta → Meus plugins** — ketiga plugin paket sudah muncul + notifikasi "Pagamento confirmado".
5. Coba *recusado/pendente*: tidak ada plugin yang diberikan; di **Pedidos** ada tombol **Pagar agora** (coba bayar lagi) dan **Cancelar pedido**.

Sandbox memakai kode yang **sama** dengan webhook asli (cek nominal, anti-duplikat, pemberian akses). Sandbox otomatis **ditolak** jika `NODE_ENV=production`.

### Mengunggah file plugin asli (wajib agar bisa di-download)
ZIP asli **tidak berisi file installer plugin** (hanya gambar & kode situs), dan sistem ini tidak membuat installer palsu. Jadi:

1. Login admin → `/admin/produtos` → tombol **Versões** pada plugin → pilih file `.zip/.exe/.msi/.7z` + nomor versi (mis. `1.0.0`) → **Enviar**.
2. File disimpan di `storage/files/` (privat, nama diacak, **tidak** bisa dibuka lewat URL).
3. Sebelum ada file, pelanggan melihat "arquivo ainda não disponível / Download em breve". Setelah ada file, tombol **Baixar instalador** aktif untuk pemilik plugin.
4. Upload versi baru → semua pemilik plugin mendapat notifikasi "Nova versão".

Download aman: server memeriksa login + hak akses → membuat **tautan sementara sekali pakai (5 menit)** → memeriksa lagi saat file diambil → mencatat log.

---

## 4. Fitur admin (`/admin`)

* **Resumo:** total pengguna/pesanan, pesanan sukses/menunggu/gagal, **pendapatan hanya dari pesanan `paid` terverifikasi**, produk terlaris, aktivitas terbaru.
* **Produtos:** tambah/edit nama, deskripsi, harga, harga lançamento, gambar, aktif/nonaktif, bundle, upload & versi plugin, saklar promo lançamento.
* **Pedidos:** cari/filter, detail pembayaran, batalkan pesanan pending, **reembolso** (sandbox: langsung; Mercado Pago: memanggil API refund lalu menunggu webhook).
* **Usuários:** cari per email, lihat pesanan & plugin, nonaktifkan/aktifkan akun, kirim notifikasi.
* **Pemberian plugin manual:** Usuários → Abrir → **Liberar plugin** → pilih plugin/paket → alasan (presente, promoção, compensação, pedido manual, outro) → centang konfirmasi. Tersimpan sebagai `admin_grant` (**bukan pembayaran, tidak masuk pendapatan**, tidak ada pesanan palsu), pengguna langsung dapat notifikasi di akun. Admin juga bisa **mencabut** akses (wajib alasan + konfirmasi).
* **Auditoria:** log semua tindakan admin (siapa, apa, kapan, IP).

---

## 5. Pembayaran asli dengan Mercado Pago

Harga situs dalam **R$ (BRL)** dan pelanggan di Brasil → Mercado Pago cocok (Pix, kartu, boleto). Anda butuh **akun Mercado Pago merchant Brasil milik pemilik bisnis**.

1. Buat akun di <https://www.mercadopago.com.br/developers> → **Suas integrações → Criar aplicação** (tipe *Checkout Pro*).
2. Salin **Access Token** (uji coba: kredensial *TEST*; produksi: kredensial *produção*) → `.env`:
   ```
   PAYMENT_PROVIDER=mercadopago
   MP_ACCESS_TOKEN=APP_USR-...
   ```
3. Di aplikasi MP → **Webhooks → Configurar notificações**: URL `https://SEU-DOMINIO/api/webhooks/mercadopago`, centang evento **Pagamentos**. Salin **chave secreta (assinatura secreta)** → `.env`: `MP_WEBHOOK_SECRET=...`
4. Isi `BASE_URL=https://SEU-DOMINIO` (wajib HTTPS & publik; `localhost` tidak bisa menerima webhook — untuk uji lokal pakai tunnel seperti ngrok/cloudflared).
5. Uji dulu dengan kredensial TEST + akun pembeli teste dari MP, baru ganti ke produksi.

Cara kerjanya (keamanan):
* Backend membuat pesanan dengan **harga dari database** → membuat *preference* di MP dengan `external_reference` = id pembayaran internal.
* Pelanggan bayar di halaman MP (kami **tidak pernah** menyentuh data kartu).
* MP memanggil webhook → server **memverifikasi tanda tangan HMAC `x-signature`**, lalu **menanyakan ulang status ke API MP** (isi webhook tidak dipercaya), mencocokkan **nominal & mata uang**, lalu memberi akses.
* Event ganda diabaikan (tabel `webhook_events` + indeks unik); satu pembayaran tidak bisa memberi akses dua kali atau menghitung pendapatan dua kali.
* Halaman "sukses" hanya **membaca** status dari server; membukanya tidak memberi plugin.

---

## 6. Deploy ke hosting (produksi)

**Netlify statis TIDAK cukup** untuk versi ini: toko butuh server yang berjalan terus, database, dan penyimpanan file privat. (Edge Function/Basic Auth "prévia" lama dan `robots.txt` yang memblokir semuanya sudah tidak dipakai.) Pilih salah satu yang menyediakan **Node.js + disk persisten**:

| Opsi | Catatan |
|---|---|
| **VPS** (Hetzner, DigitalOcean, Contabo, dll.) | Paling fleksibel & murah. Pakai Node 22 + `pm2` + Caddy/Nginx (HTTPS). |
| **Railway / Render / Fly.io** | Mudah, tetapi **wajib** pasang *Volume/Disk persisten* dan arahkan `DATABASE_PATH` & `STORAGE_DIR` ke sana — tanpa itu database dan file hilang saat restart. |

Langkah umum (VPS Ubuntu):
```bash
# di server
sudo apt install -y curl && curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
unzip LineCollection.zip -d /srv/linecollection && cd /srv/linecollection
npm install --omit=dev
cp .env.example .env && nano .env     # isi (lihat di bawah)
npm run seed && npm run criar-admin
npm i -g pm2 && pm2 start "npm start" --name linecollection && pm2 save && pm2 startup
```
`.env` produksi:
```
NODE_ENV=production
PORT=3000
BASE_URL=https://seudominio.com.br
SESSION_SECRET=<48+ karakter acak>
PAYMENT_PROVIDER=mercadopago
MP_ACCESS_TOKEN=...
MP_WEBHOOK_SECRET=...
DATABASE_PATH=/srv/linecollection-data/linecollection.db
STORAGE_DIR=/srv/linecollection-data/storage
SMTP_*=...   # untuk email reset password
```
Pasang HTTPS (Caddy: `seudominio.com.br { reverse_proxy localhost:3000 }`). Arahkan DNS domain (`linecollection.art.br`) ke server. Di mode produksi server **menolak start** jika `SESSION_SECRET` kosong atau jika masih `sandbox`.

**Backup:** salin rutin `linecollection.db` (+ file `-wal`/`-shm` bila ada, atau pakai `sqlite3 .backup`) dan folder `storage/`.

**Peluncuran:** halaman utama sudah publik di `/` (banner "prévia privada", senha Basic Auth, `noindex` dan `robots.txt` yang memblokir semuanya sudah dihapus). Jika ingin menahan penjualan sementara, nonaktifkan produk di admin: tombol belinya berubah menjadi "Indisponível" dan pesanan ditolak server.

---

## 7. Daftar yang masih butuh akun/kredensial eksternal

| Hal | Status |
|---|---|
| Akun merchant **Mercado Pago** (Access Token + secret webhook) | Dibutuhkan untuk pembayaran asli |
| **File installer plugin** asli (.zip/.exe/.msi) | Dibutuhkan; unggah lewat admin |
| **SMTP** (email) | Opsional; tanpa ini "esqueci senha" hanya mencetak link di terminal (tidak untuk produksi) |
| Domain + hosting dengan HTTPS | Untuk produksi & agar webhook MP bisa masuk |

---

## 8. Keamanan yang diterapkan
Password di-hash **bcrypt**; sesi = cookie `HttpOnly` + `SameSite=Lax` (+`Secure` di produksi) dengan token acak yang hanya disimpan sebagai hash; **CSRF token** pada semua aksi tulis; rate-limit & penguncian akun setelah 5 kali salah; validasi input; query SQL berparameter (anti SQL injection); output di-escape di frontend (anti XSS) + **Content-Security-Policy** ketat tanpa script inline; admin dicek di server dari database; data pengguna lain tidak bisa diakses (selalu difilter `user_id`); upload dicek ekstensi **dan** isi file, ukuran dibatasi, disimpan privat dengan nama acak; webhook diverifikasi; harga/nominal dihitung & dicocokkan di server; audit log admin. Tidak ada secret di frontend.

*Catatan:* Row Level Security hanya relevan untuk Supabase/Postgres. Karena arsitektur ini memakai SQLite + backend sendiri, isolasi data dilakukan di lapisan backend (dan diuji — lihat `HASIL-PENGUJIAN.md`).

---

## 9. Menjalankan tes
`testar.bat` atau `npm test` (memakai database sementara, tidak menyentuh data Anda).

## 10. Batasan yang diketahui
Lihat bagian "Batasan" di **`HASIL-PENGUJIAN.md`**.
