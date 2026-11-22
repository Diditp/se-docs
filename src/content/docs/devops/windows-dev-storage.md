---
title: "Setup Dev di Windows: Pindahkan Cache & SDK dari Drive C"
description: "Cara simpel memindahkan .gradle, .android, Android SDK, Shorebird, pub cache, dan npm cache dari drive C: ke drive D: cukup dengan environment variable — plus cara lanjutan (junction & script) untuk kasus khusus."
level: beginner
status: complete
version: "Windows 10/11 · PowerShell 5.1+ · Flutter 3.x · Android Studio · Shorebird"
updated: 2026-11-22
tags: [windows, setup, gradle, android-sdk, shorebird, flutter, storage, devops]
---

## Overview

Gradle, Android, dan Flutter menyimpan cache di `C:\Users\<nama>\` dan lama-lama bisa memakan **puluhan GB**.
Solusinya sederhana: **beri tahu setiap tool untuk menyimpan cache di drive D:** lewat *environment variable*.

> **Intinya:** set 4 variabel → restart terminal → selesai. Tidak perlu install ulang apa pun.

:::tip[Laptop baru / install ulang Windows?]
Langsung ikuti **[Cara Cepat](#cara-cepat-5-menit)** di bawah **sebelum** membuka Android Studio pertama kali.
Semua cache akan langsung terbentuk di D:, jadi tidak ada yang perlu dipindahkan.
:::

## Cara Cepat (5 menit)

### Langkah 1 — Tutup semuanya

Tutup Android Studio, VS Code, dan emulator. Lalu matikan Gradle daemon:

```powershell
adb kill-server
Get-Process java -ErrorAction SilentlyContinue | Stop-Process
```

### Langkah 2 — Buat folder di D:

```powershell
mkdir D:\DevCache
```

:::caution
Gunakan path **tanpa spasi** (`D:\DevCache`, bukan `D:\Data Saya\Cache`). Gradle dan NDK sering error kalau ada spasi.
:::

### Langkah 3 — Set environment variable

Copy-paste ke **PowerShell biasa** (tidak perlu Administrator):

```powershell
setx GRADLE_USER_HOME  "D:\DevCache\gradle"
setx ANDROID_USER_HOME "D:\DevCache\android"
setx ANDROID_AVD_HOME  "D:\DevCache\android\avd"
setx PUB_CACHE         "D:\DevCache\pub-cache"
npm config set cache "D:\DevCache\npm-cache"
```

| Variabel | Yang dipindah | Default (di C:) |
| --- | --- | --- |
| `GRADLE_USER_HOME` | Cache dependency & Gradle wrapper — **biasanya paling besar** | `%USERPROFILE%\.gradle` |
| `ANDROID_USER_HOME` | Config adb, `debug.keystore` | `%USERPROFILE%\.android` |
| `ANDROID_AVD_HOME` | Emulator (bisa 5–20 GB per emulator) | `%USERPROFILE%\.android\avd` |
| `PUB_CACHE` | Package Flutter/Dart | `%LOCALAPPDATA%\Pub\Cache` |
| npm cache | Package npm | `%LOCALAPPDATA%\npm-cache` |

### Langkah 4 — Install Flutter SDK lewat terminal

Flutter SDK cukup di-*clone* dari GitHub (cara resmi, hasilnya sama dengan download ZIP). Butuh Git terpasang.

```powershell
git clone https://github.com/flutter/flutter.git -b stable D:\dev\flutter
```

Tambahkan `D:\dev\flutter\bin` ke PATH. Perintah ini **menambahkan** ke PATH yang ada tanpa memotongnya
(berbeda dengan `setx`):

```powershell
$p = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$p;D:\dev\flutter\bin", "User")
```

Buka **terminal baru**, lalu:

```powershell
flutter --version    # pertama kali akan mengunduh Dart SDK & tools
```

:::note
- **Sudah punya Flutter di C:?** Pindahkan foldernya ke `D:\dev\flutter`, lalu ganti entri PATH lama
  (`...\flutter\bin`) dengan yang baru lewat jendela *Edit environment variables for your account*.
- **Butuh versi tertentu?** Di `D:\dev\flutter` jalankan `git checkout <versi>` (mis. `3.24.5`). Untuk banyak versi
  sekaligus, gunakan **FVM** (`dart pub global activate fvm`).
- **Update:** `flutter upgrade`.
- Jangan pasang di `C:\Program Files` atau path berspasi.
:::

### Langkah 5 — Pindahkan Android SDK

SDK diatur lewat Android Studio, bukan variabel saja:

1. Android Studio → **Settings → Languages & Frameworks → Android SDK**.
2. Klik **Edit** di *Android SDK Location*, isi `D:\DevCache\android-sdk`, lalu ikuti wizard-nya (SDK di-download ke sana).
3. Beri tahu Flutter:

   ```powershell
   flutter config --android-sdk "D:\DevCache\android-sdk"
   setx ANDROID_HOME "D:\DevCache\android-sdk"
   flutter doctor --android-licenses   # setujui lisensi Android
   ```

### Langkah 6 — Install Shorebird di D: (jika pakai Shorebird)

Installer resmi (`irm https://shorebird.dev/install.ps1 | iex`) **selalu** memasang ke `C:\Users\<nama>\.shorebird`
dan tidak punya pilihan lokasi. Shorebird juga mengunduh Flutter-nya sendiri ke dalam folder itu (±2–3 GB, terus
bertambah tiap versi). Untungnya Shorebird hanyalah repo Git yang mencari file-filenya relatif dari lokasinya sendiri,
jadi cukup lakukan yang dikerjakan installer secara manual:

**Belum pernah install:**

```powershell
git clone https://github.com/shorebirdtech/shorebird.git -b stable D:\DevCache\shorebird
```

**Sudah terpasang di C:** pindahkan foldernya (tutup terminal & IDE dulu):

```powershell
robocopy "$env:USERPROFILE\.shorebird" "D:\DevCache\shorebird" /E /MOVE
```

Lalu arahkan PATH ke lokasi baru lewat **Start → "Edit environment variables for your account" → Path → Edit**:

- **Hapus** `C:\Users\<nama>\.shorebird\bin` (jika ada).
- **Tambah** `D:\DevCache\shorebird\bin`.

:::caution
Edit PATH lewat jendela tersebut, **jangan pakai `setx PATH`** — `setx` memotong PATH di atas 1024 karakter dan
isi PATH kamu bisa hilang.
:::

Buka terminal baru, lalu jalankan `shorebird --version` (pertama kali akan menyiapkan cache) dan `shorebird doctor`.
`shorebird upgrade` berikutnya tetap berjalan normal di lokasi baru.

### Langkah 7 — Restart & cek

**Tutup semua terminal dan IDE, lalu buka lagi** (variabel baru hanya terbaca oleh proses yang baru dibuka).

```powershell
echo $env:GRADLE_USER_HOME   # harus D:\DevCache\gradle
echo $env:PUB_CACHE          # harus D:\DevCache\pub-cache
flutter doctor -v            # Android toolchain menunjuk SDK di D:
```

Lalu jalankan `flutter pub get` dan satu build. Folder di `D:\DevCache` akan terisi otomatis.

### Langkah 8 — Bersihkan C: (kalau sebelumnya sudah ada isinya)

Setelah build berhasil, folder lama di C: tidak dipakai lagi dan boleh dihapus:

- `C:\Users\<nama>\.gradle`
- `C:\Users\<nama>\AppData\Local\Pub\Cache`
- `C:\Users\<nama>\AppData\Local\Android\Sdk` (jika SDK sudah di-download ulang ke D:)
- `C:\Users\<nama>\.android\avd` (buat ulang emulator di Android Studio)
- `C:\Users\<nama>\.shorebird` (jika masih ada setelah Langkah 6)

:::danger[Jangan hilangkan debug.keystore]
Sebelum menghapus `.android`, salin dulu `debug.keystore` ke folder baru. Kalau hilang, SHA-1 debug berubah dan
Firebase / Google Sign-In harus didaftarkan ulang.

```powershell
mkdir D:\DevCache\android
copy "$env:USERPROFILE\.android\debug.keystore" D:\DevCache\android\
```
:::

## Why It Matters

- **C: penuh = Windows & build melambat**, update gagal, emulator crash.
- **Install ulang Windows lebih cepat** — cache di D: tetap ada, cukup set ulang variabelnya.
- **Bonus Flutter:** kalau project di D: tapi pub cache di C:, Kotlin kadang error
  *"this and base files have different roots"*. Memindahkan `PUB_CACHE` ke D: ikut memperbaikinya.

## Core Concepts

### Apa itu environment variable?

Pengaturan berbentuk `NAMA = nilai` yang dibaca program saat dijalankan. Contoh: Gradle mengecek `GRADLE_USER_HOME`;
kalau ada, cache disimpan di sana, kalau tidak, di `C:\Users\<nama>\.gradle`.

Hal penting yang sering bikin bingung: **program yang sudah terbuka tidak melihat perubahan**. Karena itu terminal &
IDE wajib dibuka ulang.

### Kapan butuh cara lanjutan?

Cara Cepat sudah cukup untuk 90% kasus. Pakai [cara lanjutan](#cara-lanjutan-opsional) hanya jika:

- Kamu ingin **memindahkan isi cache yang sudah ada** tanpa download ulang (koneksi lambat/kuota terbatas).
- Tool-nya **tidak punya environment variable dan tidak bisa dipindah** (mis. `.dartServer` milik IDE).
- Kamu ingin memindahkan **emulator yang sudah ada** tanpa membuatnya ulang.

## Cara Lanjutan (Opsional)

<details>
<summary><strong>A. Pakai script otomatis</strong></summary>

Unduh **[relocate-dev-caches.ps1](/downloads/relocate-dev-caches.ps1)**. Script ini menyalin isi folder ke D:,
membuat backup, membuat junction, dan men-set environment variable.

```powershell
cd D:\Tools
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # jika muncul "running scripts is disabled"
Unblock-File .\relocate-dev-caches.ps1

.\relocate-dev-caches.ps1 -Root D:\DevCache -WhatIf   # lihat rencana dulu, tidak mengubah apa pun
.\relocate-dev-caches.ps1 -Root D:\DevCache           # jalankan sungguhan
.\relocate-dev-caches.ps1 -Root D:\DevCache -Only Gradle,Shorebird   # hanya item tertentu
```

Pilihan `-Only`: `All`, `Gradle`, `AndroidUserHome`, `AndroidSdk`, `Pub`, `Shorebird`, `Npm`, `DartServer`.
Setelah semua normal, hapus folder `*.bak-<tanggal>` di C:.

</details>

<details>
<summary><strong>B. Directory junction (manual)</strong></summary>

**Junction** = "pintu belakang" di lokasi lama yang meneruskan semua akses ke lokasi baru. Program mengira folder
masih di C:, padahal datanya di D:. Berguna untuk tool tanpa environment variable.

```text
C:\Users\raven\AppData\Local\.dartServer  ──junction──►  D:\DevCache\dart-server
```

Contoh untuk cache Dart analysis server (tutup VS Code/Android Studio dulu):

```powershell
$src = "$env:LOCALAPPDATA\.dartServer"; $dst = "D:\DevCache\dart-server"
robocopy $src $dst /E /XJ                                  # 1. salin
Rename-Item $src ".dartServer.bak"                         # 2. backup
New-Item -ItemType Junction -Path $src -Target $dst        # 3. junction
# 4. buka IDE, pastikan normal  5. hapus .dartServer.bak
```

Pola yang sama bisa dipakai untuk `.gradle`, `.android`, `Pub\Cache`, atau `.shorebird` jika kamu tidak mau mengubah
PATH.

**Menghapus junction:** gunakan `cmd /c rmdir <path>` (tanpa `/s`). **Jangan** `Remove-Item -Recurse` — bisa ikut
menghapus isi folder di D:.

</details>

<details>
<summary><strong>C. Lokasi lain yang bisa dipindah</strong></summary>

| Yang dipindah | Caranya |
| --- | --- |
| Index & cache Android Studio | Buat `D:\DevCache\android-studio\idea.properties` berisi `idea.system.path=D:/DevCache/android-studio/system` dan `idea.log.path=D:/DevCache/android-studio/log`, lalu `setx STUDIO_PROPERTIES "D:\DevCache\android-studio\idea.properties"` |
| Docker Desktop | Settings → Resources → Advanced → **Disk image location** |
| Distro WSL | `wsl --manage <Distro> --move D:\WSL\<Distro>` |
| Gradle (di Android Studio) | Settings → Build Tools → Gradle → **Gradle user home** = `D:\DevCache\gradle` |

</details>

<details>
<summary><strong>D. Ukur folder mana yang paling besar</strong></summary>

```powershell
$paths = @(
  "$env:USERPROFILE\.gradle", "$env:USERPROFILE\.android", "$env:USERPROFILE\.shorebird",
  "$env:LOCALAPPDATA\Android\Sdk", "$env:LOCALAPPDATA\Pub\Cache", "$env:LOCALAPPDATA\npm-cache"
)
$paths | Where-Object { Test-Path $_ } | ForEach-Object {
  $size = (Get-ChildItem $_ -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  [pscustomobject]@{ Folder = $_; GB = [math]::Round($size / 1GB, 2) }
} | Sort-Object GB -Descending | Format-Table -AutoSize
```

</details>

## Best Practices

- **Set variabel dulu, baru install/buka Android Studio** di laptop baru — tidak ada yang perlu dipindah.
- **Satu folder induk** (`D:\DevCache`) supaya gampang dibersihkan dan di-backup.
- **Path tanpa spasi**, di **SSD** (HDD membuat build & emulator jauh lebih lambat).
- **`setx` aman untuk variabel biasa**, tapi **jangan untuk PATH** — `setx` memotong nilai di atas 1024 karakter.
  Edit PATH lewat *Edit environment variables for your account*.
- **Simpan daftar variabel ini** di catatan setup laptop agar mudah diulang.

## Anti-Patterns

- **Mengubah variabel saat Android Studio masih terbuka** → IDE tetap memakai lokasi lama sampai di-restart.
- **Menaruh cache di folder OneDrive/Google Drive** → sync ribuan file kecil, build melambat.
- **Menaruh cache di drive eksternal/USB** → build gagal saat drive tidak terpasang.
- **Menghapus `.android` tanpa backup `debug.keystore`** → SHA-1 debug berubah.
- **Menaruh SDK di `C:\Program Files`** → butuh admin saat update, sering error permission.

## Troubleshooting

| Gejala | Penyebab & solusi |
| --- | --- |
| `echo $env:GRADLE_USER_HOME` kosong | Terminal belum dibuka ulang. Tutup semua terminal/VS Code, buka lagi. |
| Cache masih terbentuk di C: | IDE dibuka sebelum variabel di-set. Restart IDE (atau logout Windows). |
| `flutter doctor` masih menunjuk SDK lama | Jalankan `flutter config --android-sdk "D:\DevCache\android-sdk"`. |
| Project Android native masih pakai SDK lama | Hapus baris `sdk.dir=` di `android/local.properties`, lalu sync ulang. |
| Emulator hilang dari daftar | AVD lama masih di C:. Buat ulang di Device Manager, atau gunakan junction (Cara Lanjutan B). |

## Performance Considerations

Memindahkan saja tidak mengecilkan cache. Bersihkan berkala:

```powershell
dart pub cache clean                              # hapus pub cache (diunduh ulang saat perlu)
npm cache clean --force
Get-ChildItem "$env:GRADLE_USER_HOME\wrapper\dists" | Sort-Object LastWriteTime   # cek versi Gradle lama
# Android SDK: uninstall system image/NDK lama lewat SDK Manager
```

Hapus juga emulator yang tidak dipakai dan matikan **Quick Boot snapshot** jika ruang terbatas.

## Security Considerations

- `debug.keystore` dan `adbkey` adalah kredensial lokal — jangan taruh di folder yang di-share/sync publik.
- Pengecualian antivirus sebaiknya **spesifik** ke `D:\DevCache`, bukan seluruh drive.
- Script dari internet: baca dulu, jalankan dengan `-WhatIf`.

## Real-World Use Cases

- **Laptop kantor SSD 256 GB** — memindahkan SDK, emulator, dan Gradle membebaskan puluhan GB.
- **Developer Flutter + Shorebird** — `.shorebird` membengkak tiap versi Flutter; clone langsung ke D: dan arahkan PATH.
- **CI runner self-hosted** — arahkan `GRADLE_USER_HOME` & `PUB_CACHE` ke disk persisten agar cache bertahan antar job.

## Interview Questions

1. Apa itu environment variable dan bagaimana Gradle memakainya?
2. Apa perbedaan junction, symbolic link, dan shortcut (.lnk) di Windows?
3. Mengapa perubahan environment variable tidak langsung terlihat di terminal yang sedang terbuka?
4. Bagaimana memindahkan Android SDK tanpa merusak project Flutter?
5. Bagaimana mempertahankan cache dependency di CI agar build lebih cepat?

## Sample Answers

1. Pasangan nama–nilai yang diwariskan ke proses saat dibuat. Gradle membaca `GRADLE_USER_HOME` untuk lokasi cache dan wrapper; jika tidak ada, memakai `~/.gradle`.
2. Junction: link folder NTFS lokal, tanpa admin, transparan untuk semua program. Symbolic link: bisa file/folder, relatif/remote, biasanya butuh admin atau Developer Mode. Shortcut `.lnk`: file biasa yang hanya dipahami Explorer.
3. Environment disalin ke proses saat proses dibuat; proses yang sudah berjalan memegang salinan lama. Harus dibuka ulang.
4. Ubah lokasi SDK di Android Studio, set `ANDROID_HOME`, jalankan `flutter config --android-sdk <path>`, sesuaikan `local.properties`, verifikasi dengan `flutter doctor -v` dan satu build.
5. Arahkan `GRADLE_USER_HOME`/`PUB_CACHE` ke lokasi yang di-cache CI (mis. `actions/cache` dengan key dari hash lockfile), atau ke disk persisten pada self-hosted runner.

## Practical Exercises

1. Jalankan script pengukuran (Cara Lanjutan D) dan catat 3 folder terbesar.
2. Ikuti Cara Cepat, lalu buktikan cache baru terbentuk di `D:\DevCache`.
3. Pindahkan `.shorebird` ke D:, ubah PATH, dan buktikan `shorebird doctor` tetap jalan.
4. Tulis checklist setup laptop baru di catatan pribadi halaman ini.

## Quick Reference

```powershell
# Copy-paste di laptop baru, lalu restart terminal & IDE
setx GRADLE_USER_HOME  "D:\DevCache\gradle"
setx ANDROID_USER_HOME "D:\DevCache\android"
setx ANDROID_AVD_HOME  "D:\DevCache\android\avd"
setx PUB_CACHE         "D:\DevCache\pub-cache"
setx ANDROID_HOME      "D:\DevCache\android-sdk"
npm config set cache "D:\DevCache\npm-cache"

# Flutter SDK
git clone https://github.com/flutter/flutter.git -b stable D:\dev\flutter
$p = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$p;D:\dev\flutter\bin", "User")
# (buka terminal baru)
flutter config --android-sdk "D:\DevCache\android-sdk"
flutter doctor --android-licenses

# Shorebird: clone ke D:, lalu tambahkan D:\DevCache\shorebird\bin ke PATH (lewat jendela env var)
git clone https://github.com/shorebirdtech/shorebird.git -b stable D:\DevCache\shorebird
```

## Related Topics

- [Environment Variables](/devops/environment-variables/)
- [Linux Fundamentals & Command Line](/devops/linux-fundamentals/)
- [Build, Release & Deployment (Flutter)](/flutter/build-release-deployment/)
- [OTA Update (Shorebird)](/flutter/ota-update/)
- [GitHub Actions](/devops/github-actions/) — caching Gradle & pub di CI
- Referensi resmi: [Gradle — Gradle User Home](https://docs.gradle.org/current/userguide/directory_layout.html), [Android — Environment variables](https://developer.android.com/tools/variables), [Dart — PUB_CACHE](https://dart.dev/tools/pub/cmd/pub-cache), [Android Studio — idea.properties](https://developer.android.com/studio/intro/studio-config), [Shorebird docs](https://docs.shorebird.dev).
