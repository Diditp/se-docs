---
title: "Android Permissions"
description: "Sistem izin Android: normal vs dangerous vs special permission, runtime permission flow, rationale & penolakan permanen, Activity Result API dan Compose, perubahan penting per versi (lokasi background, notifikasi Android 13, media granular, foreground service type), photo picker, serta permission_handler di Flutter."
level: beginner
status: complete
version: "Android 6–15 (perilaku berbeda per versi — cek dokumentasi resmi)"
updated: 2026-11-13
tags: [android, permissions, runtime-permission, privacy]
---

## Overview

Android melindungi data dan fitur sensitif (kamera, lokasi, kontak, notifikasi, file media) dengan **permission**. Sejak
Android 6.0, izin berbahaya diminta **saat runtime** ketika fitur dipakai, dan pengguna dapat menolak atau mencabutnya
kapan saja. Setiap versi Android baru cenderung memperketat aturan.

## Why It Matters

Alur izin yang buruk membuat pengguna menolak permanen, fitur gagal diam-diam, atau aplikasi ditolak Google Play (izin
sensitif tanpa justifikasi). Pertanyaan izin sering muncul di interview dan code review aplikasi lapangan (kamera,
lokasi, Bluetooth printer).

## Core Concepts

| Jenis | Contoh | Cara mendapatkan |
| --- | --- | --- |
| Install-time (normal) | `INTERNET`, `ACCESS_NETWORK_STATE` | Cukup deklarasi di manifest |
| Runtime (dangerous) | `CAMERA`, `ACCESS_FINE_LOCATION`, `POST_NOTIFICATIONS` (13+), `READ_MEDIA_IMAGES` (13+), `BLUETOOTH_CONNECT` (12+) | Dialog sistem saat runtime |
| Special | `SCHEDULE_EXACT_ALARM`, `SYSTEM_ALERT_WINDOW`, `MANAGE_EXTERNAL_STORAGE` | Halaman Settings khusus; sangat dibatasi Play |

### Perubahan penting per versi (ringkas)

| Versi | Perubahan |
| --- | --- |
| 6.0 (23) | Runtime permission |
| 10 (29) | Lokasi background terpisah (`ACCESS_BACKGROUND_LOCATION`); scoped storage |
| 11 (30) | Izin sekali pakai ("Only this time"); auto-reset izin aplikasi tak terpakai; background location via Settings |
| 12 (31) | Lokasi approximate vs precise; izin Bluetooth runtime (`BLUETOOTH_SCAN/CONNECT`) |
| 13 (33) | `POST_NOTIFICATIONS` runtime; media granular (`READ_MEDIA_IMAGES/VIDEO/AUDIO`) |
| 14 (34) | Akses foto sebagian (`READ_MEDIA_VISUAL_USER_SELECTED`); foreground service wajib tipe + izinnya |

## How It Works

```text
Fitur dipakai → cek checkSelfPermission
  GRANTED → lanjut
  belum → shouldShowRequestPermissionRationale? → tampilkan penjelasan → requestPermission
     user izinkan → lanjut
     user tolak → tampilkan alternatif / fitur terbatas
     tolak permanen (rationale = false setelah ditolak) → arahkan ke Settings aplikasi
```

## Implementation

### Manifest

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

### Activity Result API (Views)

```kotlin
private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) openScanner() else showCameraDeniedState()
}

fun onScanClicked() {
    when {
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED -> openScanner()
        shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) -> showRationale { cameraPermission.launch(Manifest.permission.CAMERA) }
        else -> cameraPermission.launch(Manifest.permission.CAMERA)
    }
}
```

### Compose

```kotlin
@Composable
fun NotificationPermissionGate(onResult: (Boolean) -> Unit) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) { LaunchedEffect(Unit) { onResult(true) }; return }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)
    Button(onClick = { launcher.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Aktifkan notifikasi pesanan") }
}
```

### Membuka Settings saat ditolak permanen

```kotlin
fun Context.openAppSettings() = startActivity(
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
)
```

### Hindari izin bila bisa: Photo Picker

```kotlin
val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(::attachPhoto) }
pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))   // tanpa izin media
```

### Flutter (permission_handler)

```dart
final status = await Permission.camera.request();
if (status.isGranted) {
  openScanner();
} else if (status.isPermanentlyDenied) {
  await openAppSettings();
}
// Android: deklarasi tetap wajib di android/app/src/main/AndroidManifest.xml
// iOS: tambahkan NSCameraUsageDescription di Info.plist
```

## Best Practices

- **Minta izin saat konteksnya jelas** (saat menekan "Scan barcode"), bukan semua di awal.
- **Jelaskan alasannya** sebelum dialog sistem bila perlu (rationale).
- **Degradasi dengan anggun**: fitur alternatif bila ditolak (input manual barcode).
- **Gunakan API tanpa izin** bila tersedia (Photo Picker, intent kamera sistem, lokasi approximate).
- **Periksa ulang setiap kali** — izin bisa dicabut di Settings atau di-reset otomatis.
- **Uji di beberapa versi Android** (11, 13, 14+).

## Anti-Patterns

- Meminta semua izin saat aplikasi pertama dibuka.
- Meminta `ACCESS_BACKGROUND_LOCATION` atau `MANAGE_EXTERNAL_STORAGE` tanpa kebutuhan inti (risiko ditolak Play).
- Mengasumsikan izin yang pernah diberikan masih berlaku.
- Loop meminta izin terus setelah ditolak.

## Performance Considerations

Cek izin itu murah, tetapi hindari memicu dialog berulang yang mengganggu. Untuk lokasi, minta presisi seminimal mungkin
(approximate) dan frekuensi update rendah untuk menghemat baterai.

## Security Considerations

Prinsip **least privilege**: minta izin minimum. Deklarasikan izin sensitif dengan alasan yang jelas di Play Console
(Data safety form). Lindungi komponen yang diekspor dengan izin kustom (`android:permission`) bila perlu, dan jangan
mengirim data dari fitur berizin (lokasi, kontak) tanpa persetujuan dan kebutuhan jelas.

## Real-World Use Cases

- Kamera untuk scan barcode produk di aplikasi kasir.
- Lokasi untuk check-in teknisi di lokasi pelanggan.
- Notifikasi pesanan baru (Android 13+).
- Bluetooth untuk printer struk (Android 12+).

## Interview Questions

1. Apa beda normal, dangerous, dan special permission?
2. Jelaskan alur runtime permission yang benar.
3. Bagaimana mendeteksi izin ditolak permanen?
4. Perubahan izin apa yang terjadi di Android 13?
5. Bagaimana mengakses foto tanpa izin storage?

## Sample Answers

1. Normal diberikan saat instalasi cukup dengan deklarasi; dangerous memerlukan persetujuan pengguna saat runtime; special memerlukan pengguna mengaktifkan dari halaman Settings khusus dan sangat dibatasi.
2. Deklarasi di manifest → saat fitur dipakai cek izin → bila perlu tampilkan rationale → minta lewat Activity Result API → tangani hasil (lanjut, alternatif, atau arahkan ke Settings bila ditolak permanen).
3. Setelah permintaan ditolak, bila `shouldShowRequestPermissionRationale` mengembalikan false dan izin belum diberikan, kemungkinan besar ditolak permanen; di Flutter `isPermanentlyDenied`.
4. Notifikasi butuh izin runtime `POST_NOTIFICATIONS`, dan izin storage dipecah menjadi media granular (`READ_MEDIA_IMAGES/VIDEO/AUDIO`).
5. Photo Picker (`PickVisualMedia`) — sistem menampilkan pemilih dan memberi akses ke item yang dipilih saja tanpa izin storage.

## Practical Exercises

1. Implementasikan alur kamera lengkap (rationale, ditolak, ditolak permanen → Settings).
2. Ganti akses galeri berbasis izin dengan Photo Picker.
3. Uji izin notifikasi di emulator Android 13+ dan perilaku saat ditolak.

## Quick Reference

```text
Normal (manifest) · Dangerous (runtime) · Special (Settings)
check → rationale → request (Activity Result API) → granted / alternatif / Settings
Android 13: POST_NOTIFICATIONS, READ_MEDIA_* · 12: Bluetooth runtime, approximate location · 14: partial photo access, FGS type
Minta saat konteks jelas · least privilege · Photo Picker tanpa izin
```

## Related Topics

- [Android App Security](/android/app-security/)
- [Background Services](/android/background-services/)
- [Push Notifications (Flutter)](/flutter/push-notifications/)
