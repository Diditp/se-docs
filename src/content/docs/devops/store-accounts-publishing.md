---
title: "Akun Developer & Publikasi App Store/Play Store (Personal vs Company)"
description: "Panduan dari nol sampai aplikasi live di Google Play dan App Store: memilih akun personal atau organisasi, biaya, dokumen & verifikasi (D-U-N-S, identitas, perangkat), kewajiban closed testing 12 tester/14 hari untuk akun personal Google Play, Android developer verification (berlaku di Indonesia sejak 30 September 2026), kepemilikan akun & akses tim, checklist listing & kebijakan, upload pertama, serta transfer aplikasi dari akun personal ke akun perusahaan."
level: beginner
status: complete
version: "Diverifikasi dari Play Console Help, developer.android.com, dan developer.apple.com pada 16 November 2026. Biaya & syarat dapat berubah, selalu cek sumber resmi sebelum mendaftar"
updated: 2026-11-16
tags: [devops, google-play, app-store, developer-account, d-u-n-s, release]
---

## Overview

Sebelum aplikasi bisa diunduh pengguna, Anda membutuhkan **akun developer** di masing-masing store:

- **Google Play Console** untuk Android.
- **Apple Developer Program** + **App Store Connect** untuk iOS.

Kedua store menyediakan dua jenis akun: **personal/individu** dan **organisasi/perusahaan**. Pilihan ini menentukan
nama penjual yang tampil di store, dokumen yang diperlukan, kewajiban pengujian, dan siapa pemilik aplikasi secara hukum.

Halaman ini membahas alur **akun → persiapan → upload pertama → live**. Detail teknis signing dan rilis ada di
[Android Signing & Google Play Release](/devops/android-play-release/) dan
[Signing, TestFlight & App Store](/ios/signing-testflight-appstore/).

## Why It Matters

- Salah memilih jenis akun bisa memaksa Anda **memindahkan aplikasi** di kemudian hari (transfer), yang punya syarat dan risiko tersendiri.
- Akun personal Google Play yang baru **tidak bisa langsung rilis ke production**: wajib closed testing terlebih dahulu.
- Proses D-U-N-S dan verifikasi organisasi bisa memakan **berminggu-minggu**. Bila tidak direncanakan, rilis tertunda.
- Untuk aplikasi klien/perusahaan, akun yang dimiliki **pribadi developer** adalah risiko bisnis (developer keluar, akses hilang).

## Core Concepts

### Perbandingan cepat

| Aspek | Google Play: Personal | Google Play: Organisasi | Apple: Individu | Apple: Organisasi |
| --- | --- | --- | --- | --- |
| Biaya | US$25 sekali bayar | US$25 sekali bayar | 99 USD/tahun (ditampilkan dalam mata uang lokal saat daftar) | 99 USD/tahun |
| Nama penjual di store | Nama developer (bebas), nama legal & negara ditampilkan | Nama organisasi legal | **Nama legal pribadi** | **Nama badan hukum** |
| Identitas | Nama & alamat legal (dari Google payments profile), diverifikasi | **D-U-N-S**, nama/alamat/telepon/website organisasi | Apple Account dengan 2FA, nama legal, usia dewasa | **D-U-N-S**, badan hukum, otoritas hukum pendaftar, email domain organisasi, website aktif |
| Syarat tambahan | Verifikasi perangkat Android via aplikasi Play Console. **Closed test ≥ 12 tester selama 14 hari** sebelum production (akun dibuat setelah 13 Nov 2023) | Tidak ada syarat 12 tester | — | Tidak menerima DBA, nama dagang, atau cabang |
| Wajib untuk | Pelajar, hobi, developer independen | Aplikasi keuangan (bank, pinjaman, kripto, investasi), kesehatan, VPN, pemerintah, dan aktivitas bisnis | Individu/usaha perorangan | Perusahaan, yayasan, institusi |
| Anggota tim | Bisa mengundang pengguna | Bisa mengundang pengguna | Terbatas | Tambah anggota dengan peran |

### Istilah penting

| Istilah | Arti |
| --- | --- |
| D-U-N-S Number | Nomor identitas bisnis 9 digit dari Dun & Bradstreet. **Gratis** (waspadai pihak ketiga yang menarik biaya). Proses bisa sampai sekitar 28 hari |
| Account owner / Account Holder | Pemilik akun. Satu-satunya yang mengelola pembayaran/kontrak dan dapat mentransfer aplikasi |
| Admin / User | Anggota tim dengan izin tertentu. Tidak perlu membayar biaya registrasi |
| Closed testing | Rilis ke daftar tester terbatas lewat Play Console |
| TestFlight | Distribusi beta iOS (internal & eksternal) |
| Android developer verification | Program Google yang mewajibkan identitas developer terverifikasi untuk aplikasi yang dipasang di perangkat Android bersertifikat, termasuk di luar Play |

## How It Works

```text
                 Android                                        iOS
1. Siapkan identitas  KTP/alamat (personal) atau D-U-N-S      Apple Account + 2FA, nama legal / D-U-N-S
                      + profil organisasi                     + badan hukum + website + email domain
2. Daftar & bayar     Play Console (US$25, kartu kredit/debit,  Apple Developer Program (99 USD/tahun)
                      bukan prepaid)                          via Apple Developer app atau web
3. Verifikasi         Identitas + email/telepon (OTP)         Identitas/legal entity oleh Apple
                      + perangkat Android (personal)
4. Siapkan aplikasi   App record, listing, kebijakan,         App ID/bundle ID, App Store Connect record,
                      signing (Play App Signing)              signing, metadata, privacy
5. Uji                Internal → closed (personal: ≥12 tester  TestFlight internal → eksternal (beta review)
                      × 14 hari) → apply production access
6. Review & rilis     Review Play → staged rollout            App Review → manual/automatic/phased release
```

## Implementation

### 1. Memilih jenis akun

```text
Aplikasi pribadi / portofolio / belajar          → Personal (Play) & Individu (Apple)
Aplikasi untuk perusahaan tempat Anda bekerja     → Akun ORGANISASI milik perusahaan (Anda diundang sebagai admin/developer)
Aplikasi klien (freelance/agensi)                 → Idealnya akun milik KLIEN. Anda diundang sebagai user
Fintech, kesehatan, VPN, pemerintah (Play)        → Wajib organisasi
Startup belum berbadan hukum                      → Mulai personal (rencanakan transfer), atau dirikan badan hukum dulu
```

Untuk Indonesia, **PT** umumnya memenuhi syarat badan hukum. Untuk bentuk usaha lain (CV, UD, firma) atau usaha
perorangan, pastikan dulu status legal entity dan data D-U-N-S-nya cocok. Apple tidak menerima nama dagang/DBA, dan
usaha perorangan didaftarkan sebagai **individu**. Bila ragu, konfirmasi ke dukungan Apple/Google sebelum membayar.

### 2. Persiapan dokumen & aset akun

**Personal / individu**

```text
□ Google Account & Apple Account khusus pengembangan (aktifkan 2FA), bukan akun yang dipakai sembarangan
□ Nama & alamat legal sesuai identitas
□ Kartu kredit/debit (Play tidak menerima kartu prepaid)
□ Email & nomor telepon aktif (verifikasi OTP) + email developer publik
□ Perangkat Android fisik (Android 10+, tidak di-root) untuk verifikasi perangkat Play
```

**Organisasi / perusahaan**

```text
□ Badan hukum (mis. PT) + dokumen legal
□ D-U-N-S Number (cek apakah sudah ada; ajukan gratis ke Dun & Bradstreet bila belum)
□ Nama & alamat di D-U-N-S SAMA PERSIS dengan Google payments profile / data pendaftaran Apple
□ Website organisasi aktif dengan domain milik perusahaan (bukan media sosial, bukan halaman parkir)
□ Email kerja di domain perusahaan (mis. mobile@perusahaan.co.id), sebaiknya alias tim, bukan email pribadi karyawan
□ Telepon organisasi yang bisa diverifikasi
□ Orang dengan kewenangan hukum (direksi atau yang diberi kuasa) untuk mendaftar & menyetujui perjanjian Apple
```

### 3. Membuat akun Google Play Console

```text
1. Buka play.google.com/console → pilih jenis akun (personal / organisasi)
2. Isi profil developer: nama developer, data legal (dari Google payments profile), kontak internal & publik
3. Verifikasi email & telepon dengan OTP
4. Bayar biaya registrasi US$25
5. Verifikasi identitas (dokumen bila diminta) → tunggu hasil verifikasi
6. Personal: selesaikan "Verify that you have access to an Android mobile device" via aplikasi Play Console di HP Android
7. Undang tim: Users and permissions → tambahkan admin & developer dengan izin minimum
```

### 4. Membuat akun Apple Developer

```text
1. Buat/siapkan Apple Account, aktifkan two-factor authentication, nama depan & belakang = nama legal
2. Enroll via Apple Developer app (iPhone/iPad/Mac) atau developer.apple.com/programs/enroll
3. Pilih Individual atau Organization (organisasi: isi legal entity name & D-U-N-S)
4. Apple memverifikasi identitas / status badan hukum (organisasi bisa dihubungi untuk konfirmasi kewenangan)
5. Setujui Apple Developer Program License Agreement & bayar keanggotaan tahunan
6. Di App Store Connect: Agreements, Tax, and Banking (wajib untuk aplikasi berbayar/in-app purchase)
7. Organisasi: undang anggota (Admin, App Manager, Developer, dsb.) di Users and Access
```

Keanggotaan Apple **tahunan**. Bila tidak diperpanjang, aplikasi hilang dari App Store. Aktifkan perpanjangan otomatis
dan pasang pengingat.

### 5. Persiapan sebelum upload pertama

| Item | Google Play | App Store |
| --- | --- | --- |
| Identitas aplikasi | Package name/applicationId (tidak bisa diganti) | Bundle ID (tidak bisa diganti setelah build diunggah) |
| Signing | Upload key + Play App Signing | Distribution certificate + provisioning profile (atau automatic signing) |
| Ikon & grafis | Ikon 512×512, feature graphic 1024×500, screenshot ponsel (dan tablet bila didukung) | Ikon app, screenshot sesuai ukuran perangkat yang diminta App Store Connect |
| Teks | Nama, deskripsi singkat & lengkap | Nama, subtitle, deskripsi, keyword, promotional text |
| Kebijakan privasi | URL kebijakan privasi (wajib bila mengumpulkan data) | URL kebijakan privasi (wajib) |
| Deklarasi data | **Data safety** form | **App Privacy** (privacy nutrition label) |
| Rating konten | Kuesioner content rating (IARC) | Kuesioner age rating |
| Akses aplikasi | Kredensial demo bila ada login | Akun demo & catatan di App Review Information |
| Lainnya | Target audience, iklan, deklarasi izin sensitif, target API level terbaru | Export compliance (enkripsi), kategori, support URL, hapus akun dari dalam aplikasi bila ada pendaftaran akun |

### 6. Upload pertama & uji

**Android**

```bash
flutter build appbundle --flavor prod --dart-define-from-file=config/prod.json
# Play Console → Create app → setup checklist (listing, kebijakan) → Testing → Internal testing → upload AAB
```

```text
Akun PERSONAL (dibuat setelah 13 Nov 2023):
1. Internal testing (opsional, cepat untuk tim)
2. Closed testing: minimal 12 tester yang opt-in terus-menerus selama 14 hari terakhir
3. Kumpulkan & tanggapi feedback tester (Testing feedback di Play Console)
4. Dashboard → Apply for production (3 bagian: closed test, aplikasi, kesiapan production)
5. Review biasanya ≤ 7 hari → setelah disetujui: Production & Open testing terbuka
Akun ORGANISASI: bisa langsung rilis ke production setelah setup selesai (tetap disarankan internal/closed test)
```

Tips merekrut 12 tester: rekan kerja, komunitas, keluarga. Beri instruksi jelas dan ingatkan agar **tidak keluar** dari
program tester sebelum 14 hari, karena hitungannya harus terus-menerus.

**iOS**

```bash
flutter build ipa --flavor prod --dart-define-from-file=config/prod.json
# Upload: Xcode Organizer / Transporter / fastlane (pilot/deliver)
```

```text
1. App Store Connect → Apps → (+) New App: platform, nama, bahasa utama, bundle ID, SKU
2. Upload build → tunggu processing
3. TestFlight internal (anggota tim) → eksternal (perlu beta app review singkat)
4. Lengkapi metadata, screenshot, App Privacy, age rating, harga & ketersediaan
5. Pilih build → Add for Review → Submit
6. Setelah approve: rilis manual, otomatis, atau phased release
```

### 7. Android developer verification (penting untuk Indonesia)

Mulai **30 September 2026**, perlindungan berlaku bagi pengguna di **Brazil, Indonesia, Singapura, dan Thailand** yang
memasang aplikasi dari **store yang berpartisipasi** pada perangkat Android bersertifikat (Android 7+). Aplikasi dari
developer yang belum terverifikasi dan belum mendaftarkan aplikasinya tidak dapat dipasang dari store tersebut.
Google merencanakan perluasan global pada 2027.

```text
Distribusi di Google Play           → Play Console mendaftarkan sebagian besar aplikasi secara otomatis.
                                      Pastikan identitas akun terverifikasi dan cek status aplikasi
Distribusi di luar Play (APK langsung, store lain) → daftar di Android Developer Console:
                                      - Full distribution: verifikasi identitas, biaya US$25
                                      - Limited distribution: untuk pelajar/hobi, hingga 20 perangkat, tanpa ID pemerintah & tanpa biaya
Instal via ADB untuk development     → tidak memerlukan verifikasi
Aplikasi enterprise lewat managed store perusahaan → tidak wajib, tetapi disarankan didaftarkan
```

Untuk aplikasi internal perusahaan (mis. aplikasi kasir yang dibagikan sebagai APK), rencanakan pendaftaran sekarang
agar instalasi tidak terhambat saat cakupan diperluas.

### 8. Kepemilikan akun & akses tim (best practice perusahaan)

```text
- Akun didaftarkan atas nama PERUSAHAAN, dengan email alias tim (mis. mobile-admin@perusahaan.co.id), bukan Gmail pribadi
- Minimal 2 orang dengan akses admin. Owner/Account Holder adalah pejabat yang berwenang
- Developer & agensi diundang sebagai user dengan izin minimum (mis. rilis ke testing, tanpa akses keuangan)
- Upload key, sertifikat, dan kunci API disimpan di secret manager perusahaan (lihat Secrets Management)
- Dokumentasikan: siapa owner, tanggal perpanjangan Apple, lokasi kunci, prosedur bila karyawan keluar
```

### 9. Memindahkan aplikasi dari akun personal ke akun perusahaan

**Google Play**

```text
1. Kedua akun aktif, terdaftar penuh, dan patuh kebijakan
2. Unduh laporan yang dibutuhkan (laporan keuangan & bulk export tidak ikut pindah)
3. Siapkan transaction ID registrasi kedua akun (email "developer registration fee")
4. Ajukan transfer → pengguna, statistik, rating, ulasan, dan listing ikut pindah
5. Pertimbangkan reset upload key bila ada kekhawatiran keamanan. Pindahkan Firebase/Google Cloud/AdMob ke akun baru
```

**App Store**

```text
1. Syarat: minimal satu versi pernah rilis, tidak sedang direview/diproses, tidak pre-order, perjanjian terbaru disetujui kedua pihak
2. Matikan TestFlight, hapus data Xcode Cloud, siapkan shared secret untuk auto-renewable subscription
3. Account Holder pengirim memulai transfer → Account Holder penerima menerima
4. Bundle ID tetap, ulasan & rating ikut, pengguna tetap mendapat update
5. Setelah transfer: perbarui keychain group/App Group/Team ID di proyek, sertifikat & profil milik tim baru
```

## Best Practices

- **Putuskan jenis akun di awal** berdasarkan siapa pemilik bisnis aplikasi.
- **Urus D-U-N-S sejak jauh hari** dan samakan data persis di semua sistem.
- **Akun perusahaan milik perusahaan**, developer hanya diundang.
- **Rencanakan 12 tester × 14 hari** bila memakai akun personal Google Play baru.
- **Siapkan aset & kebijakan sebelum upload** (privacy policy, Data safety, App Privacy, akun demo).
- **Pantau perubahan kebijakan** (target API, developer verification, perjanjian Apple).

## Anti-Patterns

- Mendaftarkan aplikasi klien di akun pribadi developer tanpa rencana transfer.
- Membayar "jasa" untuk mendapatkan D-U-N-S (prosesnya gratis).
- Menggunakan email pribadi karyawan sebagai owner akun perusahaan.
- Nama alias atau nama perusahaan di kolom nama Apple Account (menunda persetujuan).
- Membiarkan keanggotaan Apple kedaluwarsa sehingga aplikasi hilang dari App Store.
- Membagikan password akun ke tim daripada mengundang user dengan peran.

## Performance Considerations

Bukan soal performa runtime, tetapi **waktu tunggu** yang harus dimasukkan ke rencana rilis:

| Proses | Perkiraan |
| --- | --- |
| D-U-N-S baru | Hingga sekitar 28 hari |
| Verifikasi akun organisasi | Beberapa hari hingga minggu |
| Closed testing akun personal Play | Minimal 14 hari + review production access (umumnya ≤ 7 hari) |
| Review aplikasi pertama | Bervariasi. Sediakan buffer beberapa hari |
| Verifikasi rekening pembayaran Play | Hingga 5 hari |

## Security Considerations

Akun store adalah aset kritis: aktifkan 2FA untuk semua anggota, batasi izin per peran, simpan kunci signing dan kunci
API App Store Connect/Play service account di secret manager, audit daftar pengguna secara berkala, dan cabut akses
anggota yang keluar. Kontak dan data legal harus tetap aktif dan akurat. Ketidaksesuaian data D-U-N-S dapat membuat
akun dibatasi dan aplikasi diturunkan.

## Real-World Use Cases

- Developer freelance membangun aplikasi POS untuk klien. Klien membuat akun organisasi dengan D-U-N-S, lalu mengundang developer sebagai user. Aplikasi sejak awal milik klien.
- Developer independen merilis aplikasi pribadi dengan akun personal Google Play: merekrut 15 tester dari komunitas, closed test 3 minggu, lalu apply production.
- Startup awalnya merilis dengan akun personal pendiri, lalu setelah PT berdiri dan D-U-N-S terbit, aplikasi ditransfer ke akun organisasi.
- Aplikasi internal perusahaan yang dibagikan sebagai APK didaftarkan di Android Developer Console menjelang perluasan developer verification.

## Interview Questions

1. Apa beda akun developer personal dan organisasi di Google Play dan App Store?
2. Apa itu D-U-N-S Number dan kapan dibutuhkan?
3. Apa syarat rilis production untuk akun personal Google Play yang baru?
4. Bagaimana praktik terbaik kepemilikan akun store untuk aplikasi perusahaan atau klien?
5. Bagaimana memindahkan aplikasi ke akun developer lain?

## Sample Answers

1. Personal untuk individu: nama legal pribadi tampil sebagai penjual dan tidak butuh D-U-N-S. Akun personal Play baru wajib closed test sebelum production. Organisasi untuk badan hukum: butuh D-U-N-S, nama perusahaan tampil sebagai penjual, mendukung manajemen tim, dan wajib untuk kategori seperti keuangan dan kesehatan di Play.
2. Nomor identitas bisnis 9 digit dari Dun & Bradstreet yang dipakai Google dan Apple untuk memverifikasi identitas dan status hukum organisasi. Dibutuhkan untuk akun organisasi, gratis, dan prosesnya dapat memakan beberapa minggu.
3. Akun personal yang dibuat setelah 13 November 2023 harus menjalankan closed test dengan minimal 12 tester yang ikut terus-menerus selama 14 hari, lalu mengajukan production access di Dashboard dan lolos review. Juga perlu verifikasi identitas dan perangkat Android.
4. Akun didaftarkan atas nama perusahaan/klien dengan email organisasi, owner adalah pihak berwenang, minimal dua admin, developer dan agensi diundang dengan izin minimum, kunci disimpan di secret manager, dan ada dokumentasi perpanjangan serta prosedur akses.
5. Google Play: pastikan kedua akun aktif, siapkan transaction ID registrasi, ajukan transfer, dan pindahkan layanan terkait (Firebase, Cloud). App Store: penuhi kriteria transfer, Account Holder pengirim memulai dan penerima menerima. Bundle ID, rating, dan pengguna tetap, lalu perbarui konfigurasi tim di proyek.

## Practical Exercises

1. Buat tabel keputusan jenis akun untuk tiga skenario: proyek pribadi, aplikasi kantor, dan proyek klien.
2. Susun checklist dokumen dan aset rilis pertama untuk aplikasi Anda di kedua store.
3. Rencanakan timeline rilis yang memasukkan D-U-N-S, closed testing 14 hari, dan review.

## Quick Reference

```text
Play: US$25 sekali · personal (nama legal ditampilkan, verifikasi perangkat, closed test ≥12 tester × 14 hari) · organisasi (D-U-N-S, wajib untuk fintech/kesehatan/VPN/pemerintah)
Apple: 99 USD/tahun · individu (nama legal sebagai seller) · organisasi (badan hukum + D-U-N-S + website + email domain, bukan DBA)
D-U-N-S gratis, ±28 hari, data harus sama persis
Android developer verification: Indonesia sejak 30 Sep 2026 (store yang berpartisipasi) · global 2027 · Android Developer Console untuk distribusi di luar Play
Owner = perusahaan/klien · developer diundang · 2FA · kunci di secret manager · transfer bila salah akun
```

## Related Topics

- [Android Signing & Google Play Release](/devops/android-play-release/)
- [Signing, TestFlight & App Store](/ios/signing-testflight-appstore/)
- [Mobile CI/CD Pipeline](/devops/mobile-cicd-pipeline/)
