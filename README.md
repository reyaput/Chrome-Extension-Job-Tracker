# Lamaran Tracker

Chrome Extension Manifest V3 untuk mengambil data halaman lowongan yang sedang dibuka dan langsung menambahkan satu baris ke Google Sheets. Mode **Manual** mengambil data tanpa AI. Mode **AI** mendukung OpenAI langsung, Anthropic langsung, OpenRouter, serta endpoint lain yang kompatibel dengan Chat Completions.

Tidak perlu npm, framework, build, atau bundler. Pasang folder `extension/` melalui **Load unpacked**.

## Jika sudah memasang versi lama

1. Ganti seluruh kode pada editor Apps Script dengan isi `apps-script/Code.gs` terbaru, lalu simpan.
2. Jalankan **setupSheet** kembali untuk menerapkan tampilan baru dan menyesuaikan tinggi baris dengan deskripsi pada data yang sudah ada. Data dan rumus yang terisi tidak dihapus. Header harus tetap sama.
3. Pilih **Deploy > Manage deployments > Edit > New version > Deploy** agar baris berikutnya ikut mendapat tampilan baru. URL `/exec` tetap sama jika deployment yang sama diperbarui.
4. Di `chrome://extensions`, klik **Reload / Muat ulang** pada Lamaran Tracker, lalu buka kembali popup.
5. Pengaturan AI kini cukup **Kunci API** dan **Rute model**. URL web app dan kunci lama tetap disimpan. Rute lama akan dimigrasikan jika dapat dikenali; klik **Cek Koneksi** kembali.

Contoh masalah versi lama: `https://openrouter.ai/apodex/apodex-1.1-mini:free` adalah halaman model, bukan endpoint API. Sekarang URL tersebut dapat ditempel ke **Rute model** dan akan diarahkan ke endpoint API OpenRouter yang benar.

## File proyek

```text
extension/
  manifest.json       Izin dan konfigurasi ekstensi
  popup.html          Tampilan pengaturan dan tombol simpan
  popup.css           Gaya tampilan
  popup.js            Pengaturan lokal, izin AI, dan status hasil
  ai-route.js         Penentuan penyedia, endpoint, dan ID dari rute model
  background.js       Injeksi, panggilan AI, dan pengiriman ke Apps Script
  content.js          Pengambilan metadata, JSON-LD, dan detail lowongan
apps-script/
  Code.gs             Setup spreadsheet, penerimaan data, dan trigger Status
tests/
  verify.cjs          Pengujian regresi lokal tanpa dependensi tambahan
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

## 4. Gunakan mode Manual

1. Buka halaman detail lowongan dan tunggu sampai kontennya tampil. Pada LinkedIn hasil pencarian, pilih lowongan agar panel detail kanan terbuka.
2. Klik ikon Lamaran Tracker dan pilih **Manual**.
3. Pastikan URL web app sudah terisi.
4. Klik **Simpan ke Spreadsheet**. Biarkan popup terbuka untuk melihat hasilnya.
5. Jika berhasil, tampil **Tersimpan: Nama Pekerjaan - Perusahaan**. Buka tab **Lamaran Tracker** untuk memeriksa baris baru.

Manual berarti pengambilan otomatis **tanpa AI**, bukan formulir untuk mengetik data. Prioritas sumbernya adalah JSON-LD JobPosting, field khusus situs, lalu meta/judul halaman untuk judul dan perusahaan. Informasi yang tidak ditemukan dikosongkan. Deskripsi asli dibersihkan dan dipotong maksimal 1.500 karakter.

Setiap klik simpan menambahkan baris baru. Tidak ada preview atau pemeriksaan duplikat. URL halaman disimpan lengkap, termasuk seluruh parameter.

## 5. Siapkan mode AI (opsional)

1. Isi **Kunci API** milik penyedia yang ingin dipakai.
2. Isi **Rute model** sesuai tabel berikut. Tidak ada isian URL dasar atau Nama model terpisah.
3. Klik **Cek Koneksi**. Chrome akan meminta izin akses ke origin endpoint API yang ditentukan rute. Setujui izin agar koneksi dapat diperiksa.
4. Setelah tampil **Koneksi berhasil**, pilih **AI**.
5. Buka detail lowongan, lalu klik **Simpan ke Spreadsheet**.

| Penyedia | Contoh Rute model | Format request |
| --- | --- | --- |
| OpenAI langsung | `openai:gpt-4.1-mini` | Chat Completions ke `api.openai.com` |
| Anthropic langsung | `anthropic:claude-sonnet-4-6` | Messages native ke `api.anthropic.com` |
| OpenRouter | `openrouter:apodex/apodex-1.1-mini:free` | Chat Completions ke `openrouter.ai/api/v1` |
| API kompatibel OpenAI lainnya | `https://alamat-api/v1#id-model` | Chat Completions dengan kunci Bearer |

Contoh di atas menunjukkan format rute; akses/ketersediaan model mengikuti akun dan penyedia. Gunakan ID model API yang tepat, bukan nama tampilannya.

- ID seperti `apodex/apodex-1.1-mini:free`, `openai/gpt-4.1-mini`, atau `anthropic/claude-sonnet-4.6` **tanpa penanda titik dua** mengikuti format katalog OpenRouter dan dikirim melalui OpenRouter. Gunakan kunci OpenRouter untuk bentuk ini.
- Untuk memanggil penyedia langsung, gunakan penanda **`openai:`** atau **`anthropic:`**. ID singkat `gpt-...`/`o3-...` dan `claude-...` juga dikenali sebagai penyedia langsung.
- URL halaman model OpenRouter, seperti `https://openrouter.ai/apodex/apodex-1.1-mini:free`, juga diterima. Kode mengambil ID dari URL dan memakai endpoint API yang benar.
- Untuk API lain, bagian setelah **`#`** adalah ID model dan tidak dikirim sebagai bagian URL. Bentuk endpoint lengkap seperti `https://alamat-api/v1/chat/completions#id-model` juga diterima. Jika yang diisi URL dasar, kode menambahkan `/chat/completions`.
- `https://api.anthropic.com/v1/messages#claude-sonnet-4-6` memakai format native Anthropic. Penyedia/proxy lain harus mendukung format Chat Completions dan autentikasi Bearer.

Mode AI tetap terkunci jika pemeriksaan gagal. Pesan error menampilkan penyedia, status HTTP, rute, penjelasan tindakan, dan pesan asli penyedia yang relevan. Halaman HTML tidak ditumpahkan ke popup. Jika Kunci API atau Rute model diubah, verifikasi dibatalkan dan mode kembali ke Manual; klik **Cek Koneksi** kembali.

Semua isian dan pilihan mode terakhir tersimpan di `chrome.storage.local`, bukan sinkronisasi Chrome. Kunci API tersimpan lokal tanpa enkripsi tambahan; kolom kata sandi hanya menyembunyikan tampilannya. Dalam mode AI, metadata dan teks lowongan dikirim ke penyedia yang Anda isi. Cek koneksi dan ekstraksi memakai API penyedia sehingga dapat menggunakan kuota/biaya penyedia tersebut.

## 6. Status dan hitungan hari

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

## 7. Mengatasi masalah pemasangan

| Gejala | Langkah pemeriksaan |
| --- | --- |
| URL Apps Script kosong | Tempel Web app URL berakhiran `/exec` pada popup. |
| Respons Apps Script bukan JSON | Periksa URL `/exec`, akses **Anyone**, dan **Execute as: Me**. Respons halaman login atau HTML tidak dapat dipakai sebagai hasil simpan. |
| Error menyuruh menjalankan setupSheet | Jalankan `setupSheet` dari editor yang dibuka melalui spreadsheet tujuan. |
| Header tidak cocok | Periksa 14 header dan pastikan sel baris 1 setelah N kosong. Setup berhenti agar data tidak tertimpa. |
| Mode AI nonaktif | Isi Kunci API dan Rute model, lalu jalankan **Cek Koneksi** sampai berhasil. |
| HTTP 401/403 dari AI | Kunci harus berasal dari penyedia yang ditentukan rute. Periksa izin kunci dan akses model; baca pesan penyedia pada popup. |
| HTTP 402 dari AI | Periksa saldo atau batas pengeluaran akun penyedia. |
| HTTP 404 dari AI | Periksa ID model lengkap dan apakah model tersedia pada penyedia yang dipilih. Untuk API lain, periksa alamat endpoint pada rute. |
| HTTP 429 dari AI | Tunggu sebelum mengulang; periksa batas permintaan/kuota, termasuk batas model gratis. |
| Respons HTML dari AI | URL yang dipakai bukan endpoint API. Gunakan penanda penyedia atau URL API dengan `#id-model`; URL halaman model OpenRouter otomatis dikenali. |
| Izin AI ditolak | Klik **Cek Koneksi** kembali dan izinkan akses alamat penyedia. |
| Halaman tidak dapat diambil | Gunakan halaman http/https biasa. Halaman `chrome://`, Web Store, PDF viewer, dan halaman lain yang dilindungi Chrome tidak bisa diinjeksi. |
| Halaman kosong | Tunggu detail lowongan dimuat; untuk hasil pencarian, buka/pilih lowongan dahulu. |
| Beberapa kolom kosong | Halaman mungkin tidak menyediakan JSON-LD/metadata atau selector belum cocok. Jangan anggap data kosong sebagai data yang berhasil ditemukan. |
| JSON AI gagal di-parse | Tidak ada data yang dikirim ke Sheets. Periksa dukungan model terhadap instruksi JSON atau pilih Manual sendiri. |
| Waktu tunggu/jaringan bermasalah | Periksa koneksi dan endpoint. Periksa spreadsheet sebelum mengulang karena request yang sudah diterima server bisa tetap selesai. |

## 8. Memperbarui kode

- **Ekstensi:** setelah mengubah file di folder `extension`, buka `chrome://extensions` lalu klik ikon **Reload / Muat ulang** pada Lamaran Tracker. Buka kembali popup.
- **Apps Script:** tempel versi `Code.gs` terbaru dan simpan. Jalankan `setupSheet` jika perlu menerapkan format/dropdown, lalu pilih **Deploy > Manage deployments > Edit**, pilih **New version**, dan klik **Deploy**. Menyimpan kode saja tidak memperbarui deployment `/exec` yang sudah aktif.

## Selector yang belum terverifikasi

Seluruh kandidat selector berada pada objek `SITE_SELECTORS` di bagian atas `extension/content.js`. Situs asli tidak dibuka selama pembuatan, sehingga tabel ini **bukan klaim dukungan yang sudah diuji langsung**.

| Situs | Selector/field yang belum terverifikasi |
| --- | --- |
| LinkedIn | Container/panel detail kanan, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| JobStreet | Container detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| Glints | Container detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| Kalibrr | Container detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |
| Indeed | Container/panel detail, judul, perusahaan, lokasi, tipe kerja, gaji, deadline, deskripsi |

Selector yang tidak ditemukan mengembalikan `null`. JSON-LD dan metadata tetap dapat dipakai; teks halaman menjadi sumber AI jika container detail tidak ditemukan.

## Asumsi yang perlu dikonfirmasi

1. `setupSheet()` merekam ID spreadsheet aktif ke Script Properties agar web app dapat membuka spreadsheet asal dengan `openById`. Pengguna tidak memasukkan ID/tautan spreadsheet. Ini diperlukan karena konteks spreadsheet aktif tidak tersedia saat skrip dijalankan sebagai web app; lihat [dokumentasi container-bound Google](https://developers.google.com/apps-script/guides/bound).
2. Jika terdapat beberapa JobPosting, mode Manual memakai objek pertama yang ditemukan. Lokasi terstruktur dirangkai dari locality, region, country dengan koma; beberapa lokasi dipisah titik koma. Tidak ada pencocokan otomatis dengan ID lowongan pada URL.
3. Deadline Manual hanya menerima tanggal ISO `yyyy-mm-dd` atau timestamp ISO dan memakai bagian tanggal sebagaimana tertulis. Tanggal relatif seperti “3 hari lagi” dan format lokal ambigu dikosongkan.
4. Gaji terstruktur yang hanya berupa angka/objek numerik tidak dirangkai menjadi teks rentang pada mode Manual. Ekstensi memakai gaji teks JSON-LD jika tersedia, lalu field gaji situs, atau mengosongkan kolom.
5. Setiap request jaringan memiliki waktu tunggu 25 detik. Tidak ada pengiriman ulang otomatis. Penantian lock spreadsheet maksimal 10 detik.
6. URL web app harus berasal dari `https://script.google.com/macros/.../exec`. Header yang berubah setelah setup juga ditolak saat penyimpanan agar data tidak ditulis pada susunan kolom berbeda.
7. Nama perusahaan pada cadangan terakhir memakai `og:site_name` apa adanya. Metadata situs dapat berisi nama platform; judul halaman juga dapat memuat nama situs. Ekstensi tidak menebak atau memisahkan teks tersebut.
8. Penyedia langsung ditentukan dengan penanda `openai:`/`anthropic:`; rute `organisasi/model` tanpa penanda memakai OpenRouter. Penyedia lain memakai URL API dengan `#id-model` dan wajib kompatibel dengan Chat Completions/Bearer. Tidak ada deteksi penyedia dari isi kunci API.
9. Cek koneksi memakai batas 64 token dan ekstraksi 2.048 token keluaran. OpenAI langsung memakai `max_completion_tokens`; Anthropic memakai `max_tokens` serta system prompt terpisah. Temperature tidak dikirim ke Anthropic dan keluarga reasoning OpenAI yang menolak pengaturan tersebut; penyedia kompatibel lain menerima `temperature: 0` saat ekstraksi.
10. Tinggi baris data mengikuti isi sel melalui `autoResizeRows`, setelah wrapping dan lebar kolom diterapkan; tidak ada tinggi tetap 64 piksel. Kolom kosong setelah N disembunyikan secara aman; kolom yang menyimpan data tetap dipertahankan. Aturan warna tracker diperbarui tanpa menumpuk duplikat.

## Keterbatasan dan pemeriksaan

Pengambilan mencakup dokumen utama yang sudah tampil; tidak ada scroll otomatis, akses iframe, atau pembukaan halaman lanjutan. Perubahan tampilan situs, pembatasan akses, dan detail yang belum dimuat dapat menghasilkan data kosong atau teks halaman yang terlalu luas. Mode AI tidak menjamin ekstraksi akurat; periksa baris hasil di Sheets.

Jika popup ditutup saat menyimpan, pekerjaan yang sudah diterima tetap dijalankan background, tetapi hasil tidak ditampilkan ulang otomatis saat popup dibuka. Periksa spreadsheet sebelum klik simpan lagi. Penyelesaian tetap bergantung pada koneksi serta masa hidup service worker Chrome.

Sebanyak 34 pengujian regresi lokal lulus. Pengujian memakai mock Chrome, API AI, dan Apps Script untuk memeriksa rute penyedia, format request/respons native, migrasi pengaturan, error HTTP/JSON/HTML, serta pengamanan data dan penerapan gaya spreadsheet. Sintaks seluruh file JavaScript dan `Code.gs`, serta manifest JSON, juga diperiksa. Deployment Google, izin Chrome yang nyata, API AI dengan kunci Anda, dan selector situs asli memerlukan pemeriksaan langsung setelah pemasangan.

Jika Node.js tersedia, pemeriksaan sintaks dan regresi dapat dijalankan dari folder proyek melalui PowerShell:

```powershell
Get-ChildItem -LiteralPath .\extension -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-Content -LiteralPath .\apps-script\Code.gs -Raw | node --check
Get-Content -LiteralPath .\extension\manifest.json -Raw | ConvertFrom-Json
node --test .\tests\verify.cjs
```

Node.js hanya digunakan untuk pemeriksaan pengembangan, bukan syarat pemasangan atau penggunaan ekstensi.

Rujukan implementasi: [izin opsional Chrome](https://developer.chrome.com/docs/extensions/reference/api/permissions), [deployment web app Google](https://developers.google.com/apps-script/guides/web), [format sheet Google](https://developers.google.com/apps-script/reference/spreadsheet/sheet), [penulisan nilai/teks pada Sheets](https://developers.google.com/apps-script/reference/spreadsheet/range), [OpenAI Docs: Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create), [OpenRouter API](https://openrouter.ai/docs/api_reference/overview), dan [error OpenRouter](https://openrouter.ai/docs/api_reference/errors-and-debugging).
