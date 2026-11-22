<#
.SYNOPSIS
  Memindahkan folder cache/SDK developer (Gradle, Android, Pub, Shorebird, npm, Dart analysis server)
  dari drive C: ke drive lain, lalu mengarahkan tool ke lokasi baru.

.DESCRIPTION
  Untuk setiap item yang dipilih, script ini:
    1. Menyalin isi folder lama ke lokasi baru dengan robocopy (aman untuk ukuran besar).
    2. Mengganti nama folder lama menjadi "<nama>.bak-<tanggal>" (TIDAK dihapus, untuk rollback).
    3. Membuat directory junction di lokasi lama yang menunjuk ke lokasi baru,
       sehingga tool yang path-nya hardcode tetap bekerja.
    4. Mengatur environment variable resmi (level User) bila tool mendukungnya.
  Jalankan dengan -WhatIf untuk melihat rencana tanpa mengubah apa pun.

.PARAMETER Root
  Folder tujuan, mis. D:\DevCache. Harus berada di drive lokal NTFS.

.PARAMETER Only
  Item yang dipindahkan: All, Gradle, AndroidUserHome, AndroidSdk, Pub, Shorebird, Npm, DartServer.

.PARAMETER SkipJunction
  Jangan membuat junction di lokasi lama (hanya andalkan environment variable).

.PARAMETER Force
  Tetap jalan walau terdeteksi proses yang bisa mengunci file (Android Studio, Gradle daemon, adb, emulator).

.EXAMPLE
  .\relocate-dev-caches.ps1 -Root D:\DevCache -WhatIf
.EXAMPLE
  .\relocate-dev-caches.ps1 -Root D:\DevCache
.EXAMPLE
  .\relocate-dev-caches.ps1 -Root E:\DevCache -Only Gradle,Shorebird

.NOTES
  Tidak butuh hak Administrator (junction dan env var level User).
  Setelah selesai: tutup SEMUA terminal/IDE, buka lagi, lalu jalankan `flutter doctor -v`.
  Folder *.bak-* boleh dihapus manual setelah semuanya terbukti berjalan normal.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string]$Root,

  [ValidateSet('All', 'Gradle', 'AndroidUserHome', 'AndroidSdk', 'Pub', 'Shorebird', 'Npm', 'DartServer')]
  [string[]]$Only = @('All'),

  [switch]$SkipJunction,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "    [SKIP] $msg" -ForegroundColor DarkGray }
function Write-Warn2($msg){ Write-Host "    [WARN] $msg" -ForegroundColor Yellow }

function Test-Selected([string]$name) { return ($Only -contains 'All') -or ($Only -contains $name) }

function Test-IsJunction([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $item = Get-Item -LiteralPath $path -Force
  return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Set-UserEnv([string]$name, [string]$value) {
  $current = [Environment]::GetEnvironmentVariable($name, 'User')
  if ($current -eq $value) { Write-Skip "$name sudah = $value"; return }
  if ($PSCmdlet.ShouldProcess("User env $name", "Set to $value")) {
    [Environment]::SetEnvironmentVariable($name, $value, 'User')
    Write-Ok "$name = $value"
  }
}

function Add-UserPath([string]$dir) {
  $path = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($path) { $parts = $path -split ';' | Where-Object { $_ -ne '' } }
  if ($parts -contains $dir) { Write-Skip "PATH sudah berisi $dir"; return }
  if ($PSCmdlet.ShouldProcess('User PATH', "Append $dir")) {
    # Tidak memakai setx karena setx memotong PATH > 1024 karakter.
    [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')
    Write-Ok "PATH + $dir"
  }
}

function Move-DevFolder([string]$Source, [string]$Target) {
  if (-not (Test-Path -LiteralPath $Target)) {
    if ($PSCmdlet.ShouldProcess($Target, 'Create directory')) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
  }

  if (Test-IsJunction $Source) {
    $existing = (Get-Item -LiteralPath $Source -Force).Target
    Write-Skip "$Source sudah berupa junction -> $existing"
    return $true
  }

  if (Test-Path -LiteralPath $Source) {
    Write-Host "    Menyalin $Source -> $Target (bisa lama untuk folder besar)..."
    if ($PSCmdlet.ShouldProcess($Source, "Copy to $Target")) {
      # /E semua subfolder, /COPY:DAT data+atribut+timestamp, /XJ jangan ikuti junction, retry singkat
      robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /MT:8 /NFL /NDL /NJH /NP | Out-Null
      if ($LASTEXITCODE -ge 8) {
        Write-Warn2 "robocopy gagal (exit $LASTEXITCODE). Folder lama TIDAK diubah."
        return $false
      }
      $backup = "$Source.bak-$stamp"
      try {
        Rename-Item -LiteralPath $Source -NewName (Split-Path $backup -Leaf)
        Write-Ok "Folder lama dibackup sebagai $backup"
      } catch {
        Write-Warn2 "Tidak bisa me-rename $Source (masih dipakai proses lain?). Tutup IDE/terminal lalu ulangi. Data baru sudah ada di $Target."
        return $false
      }
    }
  } else {
    Write-Skip "$Source belum ada; hanya menyiapkan $Target"
  }

  if (-not $SkipJunction) {
    if ($PSCmdlet.ShouldProcess($Source, "Create junction -> $Target")) {
      $parent = Split-Path $Source -Parent
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      New-Item -ItemType Junction -Path $Source -Target $Target | Out-Null
      Write-Ok "Junction $Source -> $Target"
    }
  }
  return $true
}

# ---------------------------------------------------------------- preflight
Write-Step 'Pemeriksaan awal'
$Root = [IO.Path]::GetFullPath($Root)
$drive = [IO.Path]::GetPathRoot($Root)
if ($drive -ieq [IO.Path]::GetPathRoot($env:USERPROFILE)) {
  Write-Warn2 "Root $Root berada di drive yang sama dengan profil user ($drive). Pilih drive lain, mis. D:\DevCache."
  exit 1
}
try {
  $fs = (Get-Volume -DriveLetter $drive.Substring(0, 1)).FileSystem
  if ($fs -ne 'NTFS') { Write-Warn2 "Drive $drive berformat $fs. Junction butuh NTFS."; if (-not $SkipJunction) { exit 1 } }
} catch { Write-Warn2 "Tidak bisa membaca format drive $drive; pastikan NTFS dan drive lokal (bukan network/USB yang sering dicabut)." }

$lockers = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match '^(studio64|java|adb|emulator|qemu-system-x86_64|dart|dartaotruntime|flutter|kotlin-daemon)$' }
if ($lockers -and -not $Force) {
  Write-Warn2 ('Proses berikut masih berjalan dan bisa mengunci file: ' + (($lockers.ProcessName | Sort-Object -Unique) -join ', '))
  Write-Host  '    Tutup Android Studio/VS Code & emulator, jalankan `adb kill-server` dan `./gradlew --stop` (atau tutup proses java), lalu ulangi.'
  Write-Host  '    Atau tambahkan -Force jika yakin.'
  exit 1
}
if (-not (Test-Path -LiteralPath $Root)) {
  if ($PSCmdlet.ShouldProcess($Root, 'Create root directory')) { New-Item -ItemType Directory -Path $Root -Force | Out-Null }
}
Write-Ok "Root: $Root"

$results = [ordered]@{}

# ---------------------------------------------------------------- Gradle
if (Test-Selected 'Gradle') {
  Write-Step 'Gradle (~/.gradle: wrapper dists, dependency cache, daemon)'
  $dst = Join-Path $Root 'gradle'
  if (Move-DevFolder (Join-Path $env:USERPROFILE '.gradle') $dst) { Set-UserEnv 'GRADLE_USER_HOME' $dst; $results['Gradle'] = $dst }
}

# ---------------------------------------------------------------- Android user home (.android)
if (Test-Selected 'AndroidUserHome') {
  Write-Step 'Android user home (~/.android: AVD, debug.keystore, adbkey)'
  $dst = Join-Path $Root 'android'
  if (Move-DevFolder (Join-Path $env:USERPROFILE '.android') $dst) {
    Set-UserEnv 'ANDROID_USER_HOME' $dst
    Set-UserEnv 'ANDROID_AVD_HOME' (Join-Path $dst 'avd')
    $results['Android user home'] = $dst
  }
}

# ---------------------------------------------------------------- Android SDK
if (Test-Selected 'AndroidSdk') {
  Write-Step 'Android SDK (%LOCALAPPDATA%\Android\Sdk)'
  $dst = Join-Path $Root 'android-sdk'
  if (Move-DevFolder (Join-Path $env:LOCALAPPDATA 'Android\Sdk') $dst) {
    Set-UserEnv 'ANDROID_HOME' $dst
    $results['Android SDK'] = $dst
    if (Get-Command flutter -ErrorAction SilentlyContinue) {
      if ($PSCmdlet.ShouldProcess('flutter config', "--android-sdk $dst")) { & flutter config --android-sdk $dst | Out-Null; Write-Ok 'flutter config --android-sdk diperbarui' }
    } else {
      Write-Warn2 "Jalankan nanti: flutter config --android-sdk `"$dst`""
    }
    Write-Warn2 "Android Studio: Settings > Languages & Frameworks > Android SDK > Android SDK Location = $dst"
  }
}

# ---------------------------------------------------------------- Pub cache
if (Test-Selected 'Pub') {
  Write-Step 'Dart/Flutter pub cache (%LOCALAPPDATA%\Pub\Cache)'
  $dst = Join-Path $Root 'pub-cache'
  if (Move-DevFolder (Join-Path $env:LOCALAPPDATA 'Pub\Cache') $dst) {
    Set-UserEnv 'PUB_CACHE' $dst
    Add-UserPath (Join-Path $dst 'bin')       # untuk `dart pub global activate`
    $results['Pub cache'] = $dst
  }
}

# ---------------------------------------------------------------- Shorebird
if (Test-Selected 'Shorebird') {
  Write-Step 'Shorebird (~/.shorebird: CLI + Flutter SDK versi Shorebird + cache)'
  $dst = Join-Path $Root 'shorebird'
  # Shorebird dipasang ke ~/.shorebird dan PATH menunjuk ~/.shorebird/bin.
  # Junction membuat PATH lama tetap valid tanpa mengubah konfigurasi Shorebird.
  if (Move-DevFolder (Join-Path $env:USERPROFILE '.shorebird') $dst) { $results['Shorebird'] = $dst }
  if ($SkipJunction) { Write-Warn2 "Dengan -SkipJunction, ganti PATH ~/.shorebird/bin menjadi $dst\bin secara manual." }
}

# ---------------------------------------------------------------- npm cache
if (Test-Selected 'Npm') {
  Write-Step 'npm cache (%LOCALAPPDATA%\npm-cache)'
  $dst = Join-Path $Root 'npm-cache'
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    if ($PSCmdlet.ShouldProcess('npm config', "cache = $dst")) {
      if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
      & npm config set cache $dst --location=user | Out-Null
      Write-Ok "npm cache = $dst (cache lama boleh dihapus: npm cache clean --force sebelum script, atau hapus folder npm-cache lama)"
      $results['npm cache'] = $dst
    }
  } else { Write-Skip 'npm tidak ditemukan' }
}

# ---------------------------------------------------------------- Dart analysis server
if (Test-Selected 'DartServer') {
  Write-Step 'Dart analysis server cache (%LOCALAPPDATA%\.dartServer)'
  $src = Join-Path $env:LOCALAPPDATA '.dartServer'
  if (Test-Path -LiteralPath $src) {
    if (Move-DevFolder $src (Join-Path $Root 'dart-server')) { $results['Dart analysis server'] = (Join-Path $Root 'dart-server') }
  } else { Write-Skip "$src tidak ditemukan" }
}

# ---------------------------------------------------------------- summary
Write-Step 'Ringkasan'
if ($results.Count -eq 0) { Write-Host '    Tidak ada yang dipindahkan.' }
foreach ($k in $results.Keys) { Write-Host ("    {0,-22} -> {1}" -f $k, $results[$k]) }
Write-Host ''
Write-Host 'Langkah berikutnya:' -ForegroundColor Cyan
Write-Host '  1. Tutup SEMUA terminal, VS Code, dan Android Studio, lalu buka lagi (env var baru hanya terbaca proses baru).'
Write-Host '  2. Verifikasi: flutter doctor -v ; shorebird doctor ; gradle/gradlew build ; emulator berjalan.'
Write-Host "  3. Setelah semua normal, hapus folder cadangan *.bak-$stamp untuk membebaskan ruang di C:."
Write-Host '  Rollback: hapus junction dengan `cmd /c rmdir <path>` (BUKAN Remove-Item -Recurse), kembalikan folder .bak, hapus env var.'
