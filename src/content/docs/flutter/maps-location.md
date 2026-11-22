---
title: "Maps & Location Services"
description: "Peta dan lokasi di Flutter untuk aplikasi kurir, ride-hailing, field service, dan absensi: izin lokasi (when-in-use vs background) di Android & iOS, geolocator, akurasi vs baterai, tracking dengan distance filter dan foreground service, google_maps_flutter vs flutter_map, marker & clustering, geocoding, geofencing, mock location, pengamanan API key, serta query lokasi di backend (PostGIS)."
level: intermediate
status: complete
version: "geolocator · google_maps_flutter · flutter_map — API plugin & kebijakan store berubah, cek dokumentasi resmi"
updated: 2026-11-13
tags: [flutter, maps, location, gps, geofencing, postgis]
---

## Overview

Fitur peta dan lokasi muncul di banyak lowongan mobile: aplikasi kurir & logistik, ride-hailing, field sales, absensi
berbasis lokasi, dan pencarian outlet terdekat. Ada dua bagian yang berbeda:

- **Location**: mendapatkan posisi perangkat (GPS/jaringan), izin, akurasi, baterai, dan pelacakan.
- **Maps**: menampilkan peta, marker, rute, dan interaksi kamera.

Kesulitannya jarang di kode menampilkan peta. Yang sulit adalah **izin, baterai, perilaku background yang berbeda per OS,
dan kebijakan store**.

## Why It Matters

Lokasi adalah data pribadi yang sensitif. Implementasi yang salah bisa membuat aplikasi ditolak store (background location
tanpa alasan kuat), menguras baterai, atau mudah dicurangi dengan lokasi palsu (mock location) pada aplikasi absensi.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| When-in-use (foreground) | Lokasi hanya saat aplikasi terlihat atau ada foreground service (Android) |
| Background ("Always") | Lokasi saat app tidak terlihat. Butuh izin terpisah, alasan kuat, dan review store |
| Precise vs approximate | Android 12+ dan iOS 14+ membolehkan pengguna memberi lokasi perkiraan saja |
| Accuracy | Tinggi = GPS (boros baterai); rendah = Wi-Fi/sel (hemat) |
| Distance filter | Update hanya setelah berpindah ≥ N meter |
| Geofence | Notifikasi saat masuk/keluar area melingkar |
| Geocoding | Alamat ↔ koordinat (reverse geocoding: koordinat → alamat) |

### Izin per platform

| Platform | Foreground | Background |
| --- | --- | --- |
| Android | `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | `ACCESS_BACKGROUND_LOCATION` (Android 10+), diminta **terpisah** setelah foreground. Atau foreground service bertipe `location` (Android 14+ wajib mendeklarasikan tipe) |
| iOS | `NSLocationWhenInUseUsageDescription` | `NSLocationAlwaysAndWhenInUseUsageDescription` + Background Mode "Location updates" |

## How It Works

```text
Cek layanan lokasi aktif → cek/minta izin (dengan penjelasan sebelumnya) → ambil posisi sekali ATAU stream
→ (tracking) kirim ke backend secara batch/terthrottle → tampilkan di peta (marker, kamera)
→ hentikan stream saat tidak dibutuhkan
```

## Implementation

### Konfigurasi

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- Hanya bila benar-benar butuh tracking saat app di background: -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

```xml
<!-- ios/Runner/Info.plist -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Lokasi dipakai untuk menampilkan outlet terdekat dan rute pengantaran.</string>
```

### Service lokasi (geolocator) dengan penanganan izin lengkap

```dart
sealed class LocationResult {}
class LocationOk extends LocationResult { LocationOk(this.position); final Position position; }
class LocationServiceOff extends LocationResult {}
class LocationDenied extends LocationResult { LocationDenied({required this.permanently}); final bool permanently; }

class LocationService {
  Future<LocationResult> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationServiceOff();

    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied) return LocationDenied(permanently: false);
    if (perm == LocationPermission.deniedForever) return LocationDenied(permanently: true);

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
    );
    return LocationOk(pos);
  }
}
```

UI menangani setiap hasil: `LocationServiceOff` → tombol `Geolocator.openLocationSettings()`, `permanently` →
`Geolocator.openAppSettings()`, dan selalu ada **fallback** (input alamat manual / pilih kota).

### Tracking kurir yang hemat baterai

```dart
StreamSubscription<Position>? _sub;

void startTrip(String tripId) {
  final settings = Platform.isAndroid
      ? AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 25,                                    // update setelah berpindah 25 m
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'Pengantaran aktif',
            notificationText: 'Lokasi dibagikan ke pelanggan selama pengantaran',
          ),
        )
      : AppleSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 25,
          activityType: ActivityType.automotiveNavigation,
          pauseLocationUpdatesAutomatically: true,
          showBackgroundLocationIndicator: true,
        );

  _sub = Geolocator.getPositionStream(locationSettings: settings).listen((p) {
    _buffer.add(TrackPoint(tripId, p.latitude, p.longitude, p.accuracy, p.timestamp));
    if (_buffer.length >= 5) _flush();                         // kirim batch, simpan di DB lokal saat offline
  });
}

Future<void> endTrip() async { await _sub?.cancel(); await _flush(); }   // tracking berhenti saat trip selesai
```

### Menampilkan peta

```dart
GoogleMap(
  initialCameraPosition: const CameraPosition(target: LatLng(-6.2, 106.816), zoom: 13),
  myLocationEnabled: hasPermission,
  markers: {
    for (final o in outlets)
      Marker(markerId: MarkerId(o.id), position: LatLng(o.lat, o.lng), infoWindow: InfoWindow(title: o.name)),
  },
  onMapCreated: (c) => _controller = c,
);
// Pindah kamera: _controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 48));
```

| Pilihan | Kelebihan | Pertimbangan |
| --- | --- | --- |
| `google_maps_flutter` | Data peta Google, familiar | Biaya API & kuota, API key, platform view (performa) |
| `flutter_map` (tile OSM/Mapbox/dll.) | Murni Flutter, fleksibel, banyak penyedia tile | Patuhi kebijakan penyedia tile (server OSM publik bukan untuk produksi bervolume besar) |
| Mapbox/penyedia lain | Kustomisasi gaya, navigasi | Lisensi & biaya |

Untuk ratusan marker gunakan **clustering** dan muat marker hanya untuk area yang terlihat (query berdasarkan bounding box).

### Backend: outlet terdekat (PostGIS)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE outlets ADD COLUMN location geography(Point, 4326);
CREATE INDEX idx_outlets_location ON outlets USING GIST (location);

-- 20 outlet terdekat dalam radius 5 km
SELECT id, name, ST_Distance(location, ST_MakePoint($lng, $lat)::geography) AS meters
FROM outlets
WHERE ST_DWithin(location, ST_MakePoint($lng, $lat)::geography, 5000)
ORDER BY location <-> ST_MakePoint($lng, $lat)::geography
LIMIT 20;
```

Perhatikan: `ST_MakePoint` menerima **(longitude, latitude)**, urutan yang sering tertukar.

### Absensi berbasis lokasi & lokasi palsu

```text
Klien: cek Position.isMocked (Android), akurasi (tolak bila > 100 m), timestamp segar
Server: validasi jarak ke geofence kantor, kecepatan tidak masuk akal antar titik, dan pola mencurigakan
Klien tidak pernah menjadi satu-satunya penentu. Lokasi dari perangkat bisa dipalsukan.
```

## Best Practices

- **Minta izin saat dibutuhkan**, setelah layar penjelasan, bukan saat aplikasi dibuka pertama kali.
- **Mulai dari when-in-use**. Background location hanya untuk fitur inti dengan notifikasi yang jelas.
- **Distance filter, akurasi sesuai kebutuhan, hentikan stream** saat selesai.
- **Batch & simpan offline** titik tracking sebelum dikirim.
- **Tangani approximate location** (akurasi kilometer) dan izin yang ditolak permanen.
- **Batasi API key** dan pantau kuota/biaya peta.

## Anti-Patterns

- Meminta izin "Always" tanpa alasan. Store bisa menolak, dan pengguna tidak percaya.
- Stream lokasi akurasi tinggi tanpa distance filter yang tidak pernah dihentikan.
- Mengirim setiap titik lokasi satu per satu ke server.
- Mempercayai lokasi klien untuk absensi/pembayaran tanpa validasi server.
- Menyimpan riwayat lokasi tanpa batas waktu retensi.

## Performance Considerations

GPS adalah salah satu konsumen baterai terbesar. Pilih akurasi minimum yang cukup, gunakan distance filter atau interval,
dan biarkan iOS menjeda update otomatis. Peta adalah platform view, jadi hindari menumpuk banyak widget berat di atasnya
dan batasi jumlah marker dengan clustering.

## Security Considerations

Lokasi adalah data pribadi (UU PDP): jelaskan tujuan, minta persetujuan, batasi retensi, dan jangan kirim ke pihak ketiga
tanpa dasar. API key peta tertanam di aplikasi, jadi **batasi** di console penyedia (package name + SHA-1 untuk Android,
bundle ID untuk iOS, dan API yang diizinkan). Kunci server (Directions/Geocoding server-side) tidak boleh ada di aplikasi.

## Real-World Use Cases

- Aplikasi kurir: tracking selama trip dengan foreground service, batch setiap 5 titik, berhenti saat trip selesai.
- Pencarian outlet terdekat dengan PostGIS `ST_DWithin` + index GiST.
- Absensi lapangan: geofence kantor divalidasi server, deteksi mock location.

## Interview Questions

1. Apa beda izin lokasi foreground dan background, dan bagaimana memintanya di Android & iOS?
2. Bagaimana melacak lokasi kurir tanpa menguras baterai?
3. Bagaimana mencegah kecurangan lokasi pada aplikasi absensi?
4. Bagaimana mencari "outlet terdekat" secara efisien di backend?
5. Bagaimana mengamankan API key Google Maps di aplikasi mobile?

## Sample Answers

1. Foreground hanya saat app terlihat atau dengan foreground service. Background butuh izin tambahan (`ACCESS_BACKGROUND_LOCATION` yang diminta terpisah di Android 10+, "Always" di iOS), deklarasi store, dan alasan kuat. Mulai dari when-in-use dan minta background hanya saat fitur membutuhkannya.
2. Distance filter, akurasi secukupnya, foreground service dengan notifikasi saat trip aktif, batch pengiriman, simpan offline, dan hentikan stream saat trip selesai.
3. Klien memeriksa mock location dan akurasi. Server memvalidasi geofence, waktu, kecepatan antar titik, dan pola. Klien tidak pernah satu-satunya sumber kebenaran.
4. Simpan koordinat sebagai `geography` di PostGIS dengan index GiST, filter `ST_DWithin` untuk radius, urutkan dengan operator jarak `<->`, dan batasi hasil.
5. Batasi key di console berdasarkan package/SHA-1 atau bundle ID dan API yang boleh dipakai, pisahkan key server, pantau kuota, dan rotasi bila bocor.

## Practical Exercises

1. Implementasikan `LocationService` dengan semua status izin dan UI fallback.
2. Buat mode tracking trip dengan distance filter dan batch offline ke Drift.
3. Buat endpoint outlet terdekat dengan PostGIS dan tampilkan hasilnya sebagai marker.

## Quick Reference

```text
Service on? → izin (penjelasan dulu) → when-in-use dulu, background hanya bila wajib
Android: FINE/COARSE · BACKGROUND (terpisah, 10+) · FGS type location (14+) · iOS: WhenInUse / Always + Background Mode
geolocator: getCurrentPosition · getPositionStream(distanceFilter) · cancel saat selesai · batch + offline
Peta: google_maps_flutter / flutter_map · clustering · bounding box · API key dibatasi
Backend: PostGIS geography + GiST · ST_DWithin · ST_MakePoint(lng, lat) · validasi server untuk absensi
```

## Related Topics

- [Background Processing](/flutter/background-processing/)
- [Mobile App Security](/security/mobile-app-security/)
- [Indexing](/database/indexing/)
