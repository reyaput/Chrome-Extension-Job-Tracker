# Lamaran Tracker

Chrome Extension Manifest V3 untuk mengambil data halaman lowongan yang sedang dibuka dan langsung menambahkan satu baris ke Google Sheets. Cukup isi URL tujuan lalu klik Simpan ke Spreadsheet.

Tidak perlu npm, framework, build, atau bundler. Pasang folder `extension/` melalui **Load unpacked**.

## Jika sudah memasang versi lama

1. Perbarui folder `extension` dengan versi terbaru dari proyek ini.
2. Di `chrome://extensions`, klik **Reload / Muat ulang** pada Lamaran Tracker, lalu buka kembali popup lewat ikon di toolbar.
3. Popup kini hanya berisi URL web app dan tombol Simpan. URL tujuan lama tetap tersimpan; pengaturan yang sudah tidak dipakai dibersihkan otomatis saat popup dibuka.

Versi **1.3.1** memperbaiki pembacaan pada halaman Kalibrr dan posting LinkedIn saat login. Setelah memperbarui file, refresh tab lowongan juga sebelum mencoba menyimpan lagi.

Jika spreadsheet belum memakai format terbaru dan tinggi baris otomatis, ganti kode Apps Script dengan isi `apps-script/Code.gs`, jalankan **setupSheet**, lalu pilih **Deploy > Manage deployments > Edit > New version > Deploy**. Data dan rumus yang terisi dipertahankan; header harus tetap sama. URL `/exec` tetap sama jika deployment yang sama diperbarui.

## File proyek

```text
extension/
  manifest.json       Izin dan konfigurasi ekstensi
  popup.html          Tampilan pengaturan dan tombol simpan
  popup.css           Gaya tampilan
  popup.js            URL tujuan dan status hasil
  background.js       Injeksi, ekstraksi data, dan pengiriman ke Apps Script
  content.js          Pengambilan JSON-LD, microdata, dan teks lowongan/posting
apps-script/
  Code.gs             Setup spreadsheet, penerimaan data, dan trigger Status
tests/
  verify.cjs          Pengujian regresi lokal tanpa dependensi tambahan
  browser-fixtures.cjs Pengujian DOM di browser tanpa dependensi tambahan
README.md             Panduan pemasangan ini
```

## 1. Siapkan Google Sheets dan Apps Script

1. Buat atau buka spreadsheet tujuan di akun Google Anda.
2. Periksa **File > Settings / Setelan > Time zone / Zona waktu** di spreadsheet. Tanggal simpan, tanggal dilamar, dan hitungan hari mengikuti zona waktu spreadsheet.
3. Dari spreadsheet tersebut, pilih **Extensions / Ekstensi > Apps Script**. Buat skrip dari dalam spreadsheet, bukan proyek Apps Script terpisah.
4. Buka file `apps-script/Code.gs` di proyek ini. Salin **seluruh isinya** ke `Code.gs` pada editor Apps Script, menggantikan kode contoh, lalu simpan.
5. Di pilihan fungsi pada bagian atas editor, pilih **setupSheet**, kemudian klik **Run / Jalankan**.
6. Saat Google meminta otorisasi, pilih akun Anda dan setujui akses untuk skrip yang baru Anda pasang. Bila muncul keterangan aplikasi belum diverifikasi, periksa bahwa ini proyek milik Anda dengan kode yang baru ditempel sebelum melanjutkan melalui **Advanced / Lanjutan** jika opsi tersebut tersedia.
7. Pastikan tab **Lamaran Tracker** terbentuk dan baris pertamanya berisi 14 header. Jangan mengganti nama tab atau urutan header.

`setupSheet()` tidak menghapus data yang sudah ada. Jika baris 1 berisi header berbeda, proses berhenti dengan error sebelum mengubah spreadsheet. Header harus kosong atau sama persis dengan daftar di bawah; sel di baris 1 setelah kolom N juga harus kosong.

| Kolom | Header |
| --- | --- |
| A | Tgl Simpan |
| B | Nama Pekerjaan |
| C | Perusahaan |
| D | Platform |
| E | Status |
| F | Lokasi |
| G | Tipe Kerja |
| H | Range Gaji |
| I | Tgl Dilamar |
| J | Deadline |
| K | Sisa Hari (Deadline) |
| L | Lama Menunggu |
| M | Link Lowongan |
| N | Deskripsi |

## 2. Deploy Apps Script sebagai web app

1. Klik **Deploy > New deployment / Deployment baru**.
2. Pada pilihan jenis deployment, klik ikon roda gigi lalu pilih **Web app / Aplikasi web**.
3. Isi **Execute as / Jalankan sebagai: Me / Saya**.
4. Isi **Who has access / Siapa yang memiliki akses: Anyone / Siapa saja**. Pilihan ini berbeda dari akses yang hanya mengizinkan pengguna yang sudah login.
5. Klik **Deploy**, lalu selesaikan otorisasi bila diminta.
6. Salin **Web app URL**, misalnya `https://script.google.com/macros/s/ID_DEPLOYMENT/exec`.

Gunakan URL berakhiran **`/exec`**, bukan URL editor Apps Script, bukan `/dev`, dan bukan tautan spreadsheet. Ekstensi hanya memerlukan URL web app.

Jika opsi **Anyone** tidak tersedia, akun/organisasi mungkin membatasi deployment publik; pemasangan ini memerlukan akun yang mengizinkannya. Sesuai spesifikasi, endpoint tidak memakai token tambahan: siapa pun yang mengetahui URL web app dapat mengirim baris ke tracker. Simpan URL tersebut untuk penggunaan Anda.

## 3. Pasang ekstensi di Chrome

1. Jika proyek diperoleh dari GitHub, clone atau unduh ZIP lalu **ekstrak** terlebih dahulu.
2. Buka Chrome, ketik `chrome://extensions` di bilah alamat, lalu tekan Enter.
3. Aktifkan **Developer mode / Mode developer** di kanan atas.
4. Klik **Load unpacked / Muat yang belum dipaketkan**.
5. Pilih folder **`extension`** yang berisi `manifest.json`. Jangan memilih folder induk proyek atau folder `apps-script`.
6. Pastikan **Lamaran Tracker** muncul dalam daftar ekstensi dan dalam keadaan aktif.
7. Klik ikon puzzle **Extensions / Ekstensi** pada toolbar Chrome, lalu sematkan Lamaran Tracker agar tombolnya mudah dibuka.
8. Klik ikon Lamaran Tracker. Pada **URL web app Apps Script**, tempel URL `/exec` dari langkah deployment. Isian otomatis disimpan di komputer ini.

Biarkan folder ekstensi tetap berada di lokasi pemasangan. Jika dipindahkan, muat ulang dari lokasi barunya melalui **Load unpacked**.

## 4. Simpan lowongan

1. Buka halaman detail lowongan dan tunggu sampai kontennya tampil. Pada LinkedIn hasil pencarian, pilih lowongan agar panel detail kanan terbuka. Untuk posting lowongan, buka tautan posting lengkap (`/posts/…` atau `/feed/update/…`), lalu tampilkan **See more / Lihat selengkapnya** jika teks masih terpotong.
2. Klik ikon Lamaran Tracker di toolbar Chrome.
3. Pastikan URL web app sudah terisi.
4. Klik **Simpan ke Spreadsheet**. Biarkan popup terbuka untuk melihat hasilnya.
5. Jika berhasil, tampil **Tersimpan: Nama Pekerjaan - Perusahaan**. Buka tab **Lamaran Tracker** untuk memeriksa baris baru.

Ekstensi mengambil data otomatis dari JSON-LD JobPosting, microdata HTML JobPosting, field khusus situs, lalu metadata yang sesuai. Judul generik seperti **Kalibrr: Where Jobs Find You** dan **Posting | LinkedIn** tidak dipakai sebagai nama pekerjaan; nama platform juga tidak dipakai sebagai perusahaan. Jika nama pekerjaan tidak ditemukan, proses berhenti dengan pesan yang bisa ditindaklanjuti. Render halaman yang sedang berlangsung ditunggu maksimal enam detik sebelum hasil diperiksa.

Posting LinkedIn dibaca dari teks posting utama atau JSON-LD SocialMediaPosting. Komentar, rekomendasi, dan teks posting lama yang dibagikan ulang tidak dicampur ke teks utama. Nama pekerjaan diambil dari label posisi, daftar **Available Positions / Posisi tersedia**, atau judul eksplisit seperti **We’re Hiring | External Audit – Senior Associate**. Beberapa posisi digabung dengan titik koma dalam **satu baris**, tanpa memilih posisi secara otomatis. Perusahaan, lokasi, tipe kerja, gaji, dan deadline hanya diisi jika tertulis jelas dengan label atau pola kalimat yang didukung; nama akun penulis bukan nama perusahaan. Kartu lowongan yang dilampirkan bisa merujuk posisi berbeda, sehingga tidak dipakai menggantikan isi posting. Posting tanpa posisi yang jelas memakai label **Posting lowongan LinkedIn**, sementara teksnya tetap menjadi deskripsi.

Informasi yang tidak ditemukan dikosongkan. Deskripsi asli dibersihkan dan dipotong maksimal 1.500 karakter. Teks lowongan yang hanya berada di dalam gambar belum dapat dibaca otomatis. Jika teks posting tidak dapat diakses, ekstensi menampilkan langkah membuka posting lengkap/login dan tidak menambahkan baris kosong.

Setiap klik simpan menambahkan baris baru. Tidak ada preview atau pemeriksaan duplikat. URL halaman disimpan lengkap, termasuk seluruh parameter.

URL tujuan tersimpan di `chrome.storage.local`, bukan sinkronisasi Chrome. Data lowongan dikirim ke web app Apps Script yang Anda isi untuk ditulis ke spreadsheet.

## 5. Status dan hitungan hari

- Baris baru mendapat tanggal simpan dan tanggal dilamar hari ini, serta Status **Applied**.
- Dropdown Status: Applied, Screening, Interview HR, Interview User, Offer, Rejected.
- Dropdown Tipe Kerja: On-site, WFO, Hybrid, Remote, WFH. On-site dan WFO tetap berbeda.
- Sisa Hari (Deadline) kosong jika deadline tidak tersedia atau sudah lewat.
- Lama Menunggu berhenti bertambah ketika Status diubah menjadi **Offer** atau **Rejected**. Mengubahnya kembali ke status lain memulihkan rumus.
- Mengganti Offer ke Rejected atau sebaliknya mempertahankan angka yang sudah dibekukan.

`onEdit(e)` bekerja sebagai simple trigger; tidak perlu membuat trigger tambahan. Untuk mengubah status beberapa baris sekaligus, paste nilai ke rentang yang mencakup kolom E. Perubahan melalui skrip/API tidak memicu simple trigger ini; ubah Status dari antarmuka spreadsheet.

## Tampilan spreadsheet

`setupSheet()` menerapkan header biru gelap dengan teks putih, lebar kolom sesuai isi, header yang membungkus teks, filter tabel, serta baris data bergantian putih dan abu kebiruan. Header dan tiga kolom identitas pertama dibekukan agar tetap terbaca saat menggulir.

Status mendapat warna berbeda yang mengikuti perubahan nilainya; deadline dekat/terlewat diberi penanda warna. Gridlines disembunyikan sehingga area kosong tampak bersih. Kolom kosong setelah kolom terakhir yang berisi data (minimal sampai N) disembunyikan, **bukan dihapus**. Ke-14 kolom tracker tetap tersedia; kolom tambahan yang berisi data tidak disembunyikan oleh setup.

Dropdown tetap divalidasi di semua baris, tetapi panah pada baris kosong di bawah data tidak ditampilkan. Baris baru otomatis memperoleh dropdown, format, warna tabel, dan rentang filter yang diperluas. Deskripsi memakai **Wrap / Bungkus teks**, dan tinggi baris otomatis menyesuaikan isinya setelah data disimpan. Deskripsi panjang mendapatkan baris lebih tinggi agar teks tampil penuh. Menjalankan `setupSheet()` kembali menyesuaikan baris lama; mengedit atau paste deskripsi di kolom N juga menghitung ulang tinggi baris terkait.

## 6. Mengatasi masalah pemasangan

| Gejala | Langkah pemeriksaan |
| --- | --- |
| URL Apps Script kosong | Tempel Web app URL berakhiran `/exec` pada popup. |
| Respons Apps Script bukan JSON | Periksa URL `/exec`, akses **Anyone**, dan **Execute as: Me**. Respons halaman login atau HTML tidak dapat dipakai sebagai hasil simpan. |
| Error menyuruh menjalankan setupSheet | Jalankan `setupSheet` dari editor yang dibuka melalui spreadsheet tujuan. |
| Header tidak cocok | Periksa 14 header dan pastikan sel baris 1 setelah N kosong. Setup berhenti agar data tidak tertimpa. |
| URL tab aktif tidak dapat dibaca (versi lama) | Muat ulang ekstensi ke versi 1.2.0 atau lebih baru. Buka halaman detail lowongan, tunggu selesai dimuat, lalu buka popup lewat ikon Lamaran Tracker di toolbar Chrome. |
| Chrome tidak bisa membaca halaman lowongan | Tutup popup, pilih tab lowongan, lalu buka kembali melalui ikon ekstensi. Setelah reload ekstensi, refresh halaman lowongan juga. Popup yang dibuka sebagai halaman biasa/Inspect dapat tidak memperoleh izin tab aktif. |
| Halaman tidak dapat diambil | Gunakan halaman http/https biasa. Halaman `chrome://`, Web Store, PDF viewer, dan halaman lain yang dilindungi Chrome tidak bisa diinjeksi. |
| Halaman kosong | Tunggu detail lowongan dimuat; untuk hasil pencarian, buka/pilih lowongan dahulu. |
| Judul lowongan belum berhasil dibaca | Muat ulang ekstensi ke versi 1.3.1 dan refresh tab. Jika judul sudah tampil tetapi error berulang, pembaca belum cocok dengan varian halaman tersebut. |
| Teks posting LinkedIn belum berhasil dibaca | Muat ulang ekstensi ke versi 1.3.1 dan refresh tab. Pastikan posting lengkap sudah tampil. Jika teks tetap terlihat tetapi error berulang, itu masalah pembaca halaman, bukan bukti bahwa teks tidak tersedia. |
| Beberapa kolom kosong | Halaman mungkin tidak menyediakan JSON-LD/metadata atau selector belum cocok. Jangan anggap data kosong sebagai data yang berhasil ditemukan. |
| Waktu tunggu/jaringan bermasalah | Periksa koneksi dan endpoint. Periksa spreadsheet sebelum mengulang karena request yang sudah diterima server bisa tetap selesai. |

## 7. Memperbarui kode

- **Ekstensi:** setelah mengubah file di folder `extension`, buka `chrome://extensions` lalu klik ikon **Reload / Muat ulang** pada Lamaran Tracker. Buka kembali popup.
- **Apps Script:** tempel versi `Code.gs` terbaru dan simpan. Jalankan `setupSheet` jika perlu menerapkan format/dropdown, lalu pilih **Deploy > Manage deployments > Edit**, pilih **New version**, dan klik **Deploy**. Menyimpan kode saja tidak memperbarui deployment `/exec` yang sudah aktif.

## Cakupan pembaca situs

Pada 11 Oktober 2026, struktur halaman publik [contoh Kalibrr](https://jobseeker.kalibrr.com/c/pt-binajasa-sumber-sarana/jobs/271601/account-support-coordinator-bandung) dan [contoh posting LinkedIn](https://www.linkedin.com/posts/nadiya-jvstnad_hiring-hiring-healthcarejobs-share-7514606290451607552-jP1-/) diperiksa langsung. Kalibrr memakai microdata HTML untuk judul, organisasi, lokasi, dan deadline, serta teks gaji/deskripsi yang tampil. Posting publik LinkedIn memakai kartu posting yang sesuai ID share/activity dan teks komentar utama, dengan JSON-LD SocialMediaPosting sebagai cadangan. Pemeriksaan dua contoh ini tidak menjamin semua tampilan/login situs.

Varian saat login juga diperiksa langsung pada tab Chrome pengguna. Aplikasi `jobseeker.kalibrr.com` memakai elemen `kb-job-page`, judul `h1`, komponen `kb-salary-range`, dan bagian **Job Description** tanpa JSON-LD atau scope JobPosting. Perusahaan, lokasi, gaji, dan deskripsi dibaca dari bagian detail yang sama. Deadline seperti **23 Oct** tanpa tahun lengkap tetap dikosongkan.

LinkedIn versi login yang diperiksa memakai kartu `componentkey="update-card-focus…"`, ID `translatable-commentary-…`, dan `data-testid="expandable-text-box"`, dengan nama kelas yang dihasilkan otomatis. Pembaca memakai atribut tersebut serta tautan activity/share, bukan nama kelas acak. Posting lama di dalam tautan kartu kutipan dan teks komentar dikecualikan. Kode produksi juga diuji pada cuplikan DOM kedua tab; cuplikan konten pengguna tidak disertakan dalam repositori.

Pengujian DOM lokal mereproduksi atribut yang ditemukan di Chrome dan mencakup pemuatan SPA yang terlambat, beberapa kartu feed, ID posting berbeda, JSON-LD bersarang, teks komentar, serta repost dengan deadline berbeda. Tampilan situs lain yang belum diperiksa tetap dapat berubah. Kandidat lain berada pada objek `SITE_SELECTORS` di `extension/content.js`:

| Situs | Selector/field yang belum terverifikasi |
| --- | --- |
| LinkedIn Jobs | Container/panel detail kanan, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| JobStreet | Container detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| Glints | Container detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| Kalibrr | Varian selain halaman publik/microdata dan aplikasi kb-job-page, serta field tipe kerja yang tidak eksplisit |
| Indeed | Container/panel detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |

Selector yang tidak ditemukan mengembalikan `null`. JSON-LD, microdata pada container detail, dan metadata tetap dapat dipakai jika field khusus situs tidak ditemukan.

## Asumsi yang perlu dikonfirmasi

1. `setupSheet()` merekam ID spreadsheet aktif ke Script Properties agar web app dapat membuka spreadsheet asal dengan `openById`. Pengguna tidak memasukkan ID/tautan spreadsheet. Ini diperlukan karena konteks spreadsheet aktif tidak tersedia saat skrip dijalankan sebagai web app; lihat [dokumentasi container-bound Google](https://developers.google.com/apps-script/guides/bound).
2. Jika terdapat beberapa JSON-LD JobPosting, ekstensi memakai objek pertama yang ditemukan, lalu microdata pada container detail. Lokasi terstruktur dirangkai dari locality, region, country dengan koma; beberapa lokasi dipisah titik koma. JobPosting belum dicocokkan otomatis dengan ID lowongan pada URL; kartu posting LinkedIn dicocokkan dengan ID share/activity jika tersedia.
3. Deadline menerima tanggal ISO `yyyy-mm-dd`, timestamp ISO, atau nama bulan Indonesia/Inggris dengan tahun lengkap, seperti `31 Oktober 2026` dan `Oct 31, 2026`. Timestamp memakai bagian tanggal sebagaimana tertulis. Tanggal relatif, tanggal tanpa tahun, dan format numerik ambigu seperti `10/11/2026` dikosongkan.
4. Gaji terstruktur yang hanya berupa angka/objek numerik tidak dirangkai menjadi teks rentang. Ekstensi memakai gaji teks JSON-LD jika tersedia, lalu field gaji situs, atau mengosongkan kolom.
5. Setiap request jaringan memiliki waktu tunggu 25 detik. Tidak ada pengiriman ulang otomatis. Penantian lock spreadsheet maksimal 10 detik.
6. URL web app harus berasal dari `https://script.google.com/macros/.../exec`. Header yang berubah setelah setup juga ditolak saat penyimpanan agar data tidak ditulis pada susunan kolom berbeda.
7. Nama perusahaan pada cadangan terakhir memakai `og:site_name` jika nilainya bukan nama platform. Metadata judul generik yang dikenal disaring, tetapi metadata judul lainnya tetap berasal dari situs dan dapat memuat nama situs. Posting bebas hanya mendukung pola teks eksplisit; informasi lain harus diperiksa atau dilengkapi di Sheets.
8. Tinggi baris data mengikuti isi sel melalui `autoResizeRows`, setelah wrapping dan lebar kolom diterapkan. Kolom kosong setelah N disembunyikan secara aman; kolom yang menyimpan data tetap dipertahankan. Aturan warna tracker diperbarui tanpa menumpuk duplikat.

## Keterbatasan dan pemeriksaan

Pengambilan mencakup dokumen utama yang sudah tampil; tidak ada scroll otomatis, akses iframe, atau pembukaan halaman lanjutan. Perubahan tampilan situs, pembatasan akses, dan detail yang belum dimuat dapat menghasilkan data kosong atau teks halaman yang terlalu luas. Periksa baris hasil di Sheets untuk memastikan informasi yang ditemukan sesuai lowongan.

Jika popup ditutup saat menyimpan, pekerjaan yang sudah diterima tetap dijalankan background, tetapi hasil tidak ditampilkan ulang otomatis saat popup dibuka. Periksa spreadsheet sebelum klik simpan lagi. Penyelesaian tetap bergantung pada koneksi serta masa hidup service worker Chrome.

Pengujian regresi lokal memakai mock Chrome dan Apps Script untuk memeriksa ekstraksi data, penyimpanan satu baris, URL tab yang kosong, penolakan halaman terbatas/izin injeksi, pengaturan popup, respons web app, pengamanan data, serta penerapan gaya spreadsheet. Pengujian DOM menggunakan kode ekstraksi yang sama di browser. Deployment Google, izin Chrome yang nyata, dan varian situs lainnya tetap memerlukan pemeriksaan setelah pemasangan.

Jika Node.js tersedia, pemeriksaan sintaks dan regresi dapat dijalankan dari folder proyek melalui PowerShell:

```powershell
Get-ChildItem -LiteralPath .\extension -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-Content -LiteralPath .\apps-script\Code.gs -Raw | node --check
Get-Content -LiteralPath .\extension\manifest.json -Raw | ConvertFrom-Json
node --test .\tests\verify.cjs
```

Node.js hanya digunakan untuk pemeriksaan pengembangan, bukan syarat pemasangan atau penggunaan ekstensi.

Untuk mengulang pengujian DOM, jalankan `node tests/browser-fixtures.cjs`, buka `http://127.0.0.1:8765`, dan tunggu semua kasus selesai (beberapa kasus menguji batas tunggu enam detik). Halaman menampilkan PASS/FAIL tanpa mengirim data ke spreadsheet. Hentikan server dengan Ctrl+C setelah selesai.

Rujukan implementasi: [izin activeTab Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [API tabs Chrome](https://developer.chrome.com/docs/extensions/reference/api/tabs), [deployment web app Google](https://developers.google.com/apps-script/guides/web), [format sheet Google](https://developers.google.com/apps-script/reference/spreadsheet/sheet), dan [penulisan nilai/teks pada Sheets](https://developers.google.com/apps-script/reference/spreadsheet/range).
