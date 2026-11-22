---
title: "Sorting & Searching"
description: "Algoritma sorting (bubble, insertion, merge, quick, counting) dan searching (linear, binary search & variasinya), kompleksitas, stabilitas, serta pola soal yang sering muncul."
level: intermediate
status: complete
updated: 2026-11-12
tags: [coding-test, sorting, searching, binary-search, algorithms]
---

## Overview

**Sorting** mengurutkan data; **searching** menemukan data. Di pekerjaan nyata Anda memakai sort bawaan bahasa, tetapi
coding test sering meminta Anda **menjelaskan atau mengimplementasikan** merge sort/quick sort dan **binary search** —
termasuk variasinya (posisi pertama, batas, pencarian pada jawaban).

## Why It Matters

- Memilih algoritma yang tepat memengaruhi kompleksitas (O(n²) vs O(n log n)).
- Binary search adalah teknik serbaguna yang sering muncul dalam bentuk tersamar ("cari nilai minimum yang memenuhi syarat").
- Konsep stabilitas dan in-place menunjukkan pemahaman mendalam.

## Core Concepts

| Algoritma | Rata-rata | Terburuk | Ruang | Stabil | Catatan |
| --- | --- | --- | --- | --- | --- |
| Bubble sort | O(n²) | O(n²) | O(1) | ✓ | Hanya untuk edukasi |
| Insertion sort | O(n²) | O(n²) | O(1) | ✓ | Cepat untuk data kecil/hampir terurut |
| Selection sort | O(n²) | O(n²) | O(1) | ✗ | Jumlah swap minimal |
| Merge sort | O(n log n) | O(n log n) | O(n) | ✓ | Konsisten, cocok linked list & data eksternal |
| Quick sort | O(n log n) | O(n²) | O(log n) | ✗ | Cepat di praktik; pilih pivot acak |
| Heap sort | O(n log n) | O(n log n) | O(1) | ✗ | In-place, terjamin |
| Counting sort | O(n + k) | O(n + k) | O(k) | ✓ | Untuk integer rentang kecil |

- **Stabil**: elemen dengan key sama mempertahankan urutan awal (penting saat sort multi-kriteria).
- **Sort bawaan**: Dart `List.sort` (tidak dijamin stabil), JS `Array.prototype.sort` (stabil sejak ES2019; tanpa comparator mengurutkan sebagai string!), Kotlin `sortedBy` (stabil).
- **Binary search** membutuhkan data terurut atau fungsi **monoton** (false…false, true…true).

## How It Works

```text
Merge sort: bagi dua → urutkan masing-masing (rekursif) → gabungkan dua list terurut  (divide & conquer)
Quick sort: pilih pivot → partisi (< pivot | pivot | > pivot) → rekursif di kedua sisi
Binary search: lo..hi; mid = lo + (hi-lo)/2; buang separuh yang pasti tidak berisi jawaban → O(log n)
```

## Implementation

### Merge sort

```dart
List<int> mergeSort(List<int> a) {
  if (a.length <= 1) return a;
  final mid = a.length ~/ 2;
  final left = mergeSort(a.sublist(0, mid));
  final right = mergeSort(a.sublist(mid));
  final out = <int>[];
  var i = 0, j = 0;
  while (i < left.length && j < right.length) {
    out.add(left[i] <= right[j] ? left[i++] : right[j++]);   // <= menjaga stabilitas
  }
  return out..addAll(left.sublist(i))..addAll(right.sublist(j));
}
```

### Quick sort (Lomuto, pivot acak)

```ts
function quickSort(a: number[], lo = 0, hi = a.length - 1): number[] {
  if (lo >= hi) return a;
  const p = lo + Math.floor(Math.random() * (hi - lo + 1));
  [a[p], a[hi]] = [a[hi], a[p]];
  const pivot = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) if (a[j] < pivot) { [a[i], a[j]] = [a[j], a[i]]; i++; }
  [a[i], a[hi]] = [a[hi], a[i]];
  quickSort(a, lo, i - 1);
  quickSort(a, i + 1, hi);
  return a;
}
```

### Binary search: indeks target, posisi pertama, dan batas

```dart
int binarySearch(List<int> a, int target) {
  var lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    final mid = lo + (hi - lo) ~/ 2;
    if (a[mid] == target) return mid;
    if (a[mid] < target) { lo = mid + 1; } else { hi = mid - 1; }
  }
  return -1;
}

/// Indeks pertama dengan a[i] >= target (lower bound); = a.length jika tidak ada
int lowerBound(List<int> a, int target) {
  var lo = 0, hi = a.length;
  while (lo < hi) {
    final mid = lo + (hi - lo) ~/ 2;
    if (a[mid] < target) { lo = mid + 1; } else { hi = mid; }
  }
  return lo;
}
// Jumlah kemunculan x = lowerBound(a, x + 1) - lowerBound(a, x)
```

### Binary search pada jawaban: kapasitas minimum kirim paket dalam D hari

```ts
function shipWithinDays(weights: number[], days: number): number {
  const canShip = (cap: number) => {
    let d = 1, load = 0;
    for (const w of weights) {
      if (load + w > cap) { d++; load = 0; }
      load += w;
    }
    return d <= days;
  };
  let lo = Math.max(...weights), hi = weights.reduce((a, b) => a + b, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (canShip(mid)) hi = mid; else lo = mid + 1;     // cari kapasitas terkecil yang memenuhi
  }
  return lo;
}
```

### Sort multi-kriteria (comparator)

```dart
orders.sort((a, b) {
  final byStatus = a.status.index.compareTo(b.status.index);
  if (byStatus != 0) return byStatus;
  return b.createdAt.compareTo(a.createdAt);          // terbaru dulu dalam status yang sama
});
```

```ts
[10, 9, 1].sort();                 // ❌ [1, 10, 9] — dibandingkan sebagai string!
[10, 9, 1].sort((a, b) => a - b);  // ✅ [1, 9, 10]
```

## Best Practices

- **Pakai sort bawaan di kode produksi**; implementasi sendiri hanya untuk interview/kasus khusus.
- **Comparator eksplisit** di JavaScript untuk angka.
- **Binary search: tentukan invariant** (apa arti `lo` dan `hi`) sebelum menulis loop; uji array 0, 1, 2 elemen.
- **`mid = lo + (hi − lo) / 2`** untuk menghindari overflow di bahasa dengan integer terbatas.
- **Kenali "monotonic predicate"** untuk binary search pada jawaban (kapasitas, waktu, harga minimum).

## Anti-Patterns

- Sort ulang data setiap kali menambah satu elemen (gunakan insertion ke posisi yang tepat atau struktur heap).
- Binary search pada data yang tidak terurut.
- Quick sort dengan pivot elemen pertama pada data yang sudah terurut → O(n²).
- Menganggap sort bawaan selalu stabil di semua bahasa.

## Performance Considerations

- n log n untuk n = 10⁶ ≈ 2 × 10⁷ operasi — sangat cepat.
- Untuk data hampir terurut, insertion sort/TimSort sangat efisien.
- Jika hanya perlu k elemen teratas, gunakan heap (O(n log k)) atau quickselect (O(n) rata-rata) daripada sort penuh.
- Di database, `ORDER BY` + index menghindari sort di memori aplikasi.

## Security Considerations

Sorting/searching atas input user yang sangat besar dapat menjadi vektor DoS — batasi ukuran input dan lakukan
pengurutan/pencarian di database dengan index serta pagination.

## Real-World Use Cases

- Urutkan transaksi berdasarkan status lalu waktu (comparator multi-kriteria).
- Binary search pada tabel tarif bertingkat (harga berdasarkan jumlah).
- `git bisect` adalah binary search pada riwayat commit.

## Interview Questions

1. Bandingkan merge sort dan quick sort.
2. Apa arti sorting stabil dan kapan penting?
3. Implementasikan binary search; apa syaratnya?
4. Temukan posisi pertama dan terakhir sebuah nilai pada array terurut.
5. Mengapa `[10, 9, 1].sort()` di JavaScript menghasilkan urutan aneh?

## Sample Answers

1. Merge sort selalu O(n log n), stabil, tetapi butuh O(n) memori tambahan. Quick sort rata-rata O(n log n) dengan konstanta kecil dan in-place, tetapi terburuk O(n²) jika pivot buruk (diatasi pivot acak) dan tidak stabil.
2. Elemen dengan key sama tetap pada urutan relatif awal; penting saat mengurutkan bertahap berdasarkan beberapa kriteria atau menjaga urutan input yang bermakna.
3. Pada data terurut (atau predikat monoton), bandingkan elemen tengah dan buang separuh ruang pencarian setiap langkah — O(log n).
4. Lower bound untuk `x` (posisi pertama ≥ x) dan lower bound untuk `x + 1` dikurangi satu (posisi terakhir) — keduanya O(log n).
5. Tanpa comparator, `sort` mengubah elemen menjadi string dan mengurutkan secara leksikografis ("1" < "10" < "9"). Gunakan `(a, b) => a - b`.

## Practical Exercises

1. Implementasikan insertion sort dan uji pada data hampir terurut.
2. Cari elemen di array terurut yang dirotasi (mis. `[4,5,6,1,2,3]`) dalam O(log n).
3. Hitung akar kuadrat bilangan bulat (floor) tanpa fungsi bawaan menggunakan binary search.
4. Temukan k produk terlaris dari daftar penjualan tanpa sort penuh.

## Quick Reference

```text
O(n²): bubble/insertion/selection · O(n log n): merge (stabil, O(n) ruang), quick (rata-rata, pivot acak), heap
Counting sort O(n+k) untuk integer rentang kecil · JS sort: selalu beri comparator
Binary search: terurut/monoton · mid = lo + (hi-lo)/2 · lower bound · cari jawaban minimum yang memenuhi
```

## Related Topics

- [Problem Solving Framework](/interview/coding-test/problem-solving-framework/)
- [Recursion](/interview/coding-test/recursion/)
- [Indexing (database)](/database/indexing/)
