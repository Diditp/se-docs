---
title: "Array, List & String Manipulation"
description: "Pola soal array & string untuk coding test: two pointers, sliding window, prefix sum, in-place, dan manipulasi string — dengan solusi Dart/TypeScript dan analisis kompleksitas."
level: beginner
status: complete
updated: 2026-11-12
tags: [coding-test, array, string, two-pointers, sliding-window, prefix-sum]
---

## Overview

Soal **array/list dan string** adalah bagian terbesar coding test tingkat awal–menengah. Hampir semuanya bisa
diselesaikan dengan sedikit pola: **iterasi + akumulator**, **two pointers**, **sliding window**, **prefix sum**,
**hash map** untuk lookup, dan **sorting**.

## Why It Matters

Soal ini menguji ketelitian (indeks, batas, kasus kosong), kemampuan memilih pola yang tepat, dan pemahaman kompleksitas.
Kesalahan umum bukan algoritmanya, tetapi *off-by-one* dan edge case.

## Core Concepts

| Pola | Ciri soal | Kompleksitas khas |
| --- | --- | --- |
| Akumulator satu kali jalan | max/min/sum/hitung | O(n), O(1) |
| Two pointers (ujung ke tengah) | Array terurut, palindrome, reverse, pasangan | O(n), O(1) |
| Two pointers (lambat–cepat) | Hapus duplikat in-place, pindahkan nol | O(n), O(1) |
| Sliding window | Subarray/substring berurutan dengan syarat | O(n) |
| Prefix sum | Jumlah rentang berulang, subarray sum = k | O(n) + O(1) per query |
| Frekuensi (map/array 26) | Anagram, karakter unik, mayoritas | O(n) |
| Sort dulu | Interval, pasangan terdekat, grup | O(n log n) |

String di Dart & JavaScript bersifat **immutable** — penggabungan di loop sebaiknya memakai `StringBuffer` (Dart) atau array + `join` (JS).

## How It Works

Langkah cepat memilih pola:

```text
Butuh lookup "sudah pernah lihat X?"         → hash map/set
Data terurut / dari dua ujung                → two pointers
"Subarray/substring berurutan terpanjang/terpendek dengan syarat" → sliding window
"Jumlah rentang i..j" berkali-kali           → prefix sum
Urutan tidak penting & butuh pengelompokan  → sort atau frekuensi
```

## Implementation

### Reverse in-place (two pointers)

```dart
void reverseInPlace<T>(List<T> a) {
  var i = 0, j = a.length - 1;
  while (i < j) {
    final t = a[i]; a[i] = a[j]; a[j] = t;
    i++; j--;
  }
}
```

### Hapus duplikat dari array terurut, kembalikan panjang baru (slow–fast)

```ts
function removeDuplicates(nums: number[]): number {
  if (nums.length === 0) return 0;
  let slow = 0;
  for (let fast = 1; fast < nums.length; fast++) {
    if (nums[fast] !== nums[slow]) nums[++slow] = nums[fast];
  }
  return slow + 1;          // O(n) waktu, O(1) ruang
}
```

### Pindahkan semua nol ke akhir dengan urutan tetap

```dart
void moveZeroes(List<int> a) {
  var insert = 0;
  for (final x in a) { if (x != 0) a[insert++] = x; }
  while (insert < a.length) { a[insert++] = 0; }
}
```

### Maksimum jumlah subarray berurutan (Kadane)

```ts
function maxSubarraySum(a: number[]): number {
  let best = a[0], cur = a[0];
  for (let i = 1; i < a.length; i++) {
    cur = Math.max(a[i], cur + a[i]);   // mulai baru atau lanjutkan
    best = Math.max(best, cur);
  }
  return best;
}
```

### Sliding window ukuran tetap: rata-rata penjualan 7 hari tertinggi

```dart
double maxAverage(List<int> sales, int k) {
  var sum = 0;
  for (var i = 0; i < k; i++) sum += sales[i];
  var best = sum;
  for (var i = k; i < sales.length; i++) {
    sum += sales[i] - sales[i - k];     // geser window: tambah kanan, kurangi kiri
    if (sum > best) best = sum;
  }
  return best / k;
}
```

### Prefix sum: jumlah subarray yang bernilai k

```ts
function subarraySumEqualsK(nums: number[], k: number): number {
  const seen = new Map<number, number>([[0, 1]]);   // prefix sum → frekuensi
  let sum = 0, count = 0;
  for (const x of nums) {
    sum += x;
    count += seen.get(sum - k) ?? 0;
    seen.set(sum, (seen.get(sum) ?? 0) + 1);
  }
  return count;                                      // O(n), juga benar untuk angka negatif
}
```

### String: kompres "aaabbc" → "a3b2c1"

```dart
String compress(String s) {
  if (s.isEmpty) return s;
  final out = StringBuffer();
  var count = 1;
  for (var i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] == s[i - 1]) {
      count++;
    } else {
      out..write(s[i - 1])..write(count);
      count = 1;
    }
  }
  return out.toString();
}
```

### String: karakter pertama yang tidak berulang

```ts
function firstUniqueChar(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  for (let i = 0; i < s.length; i++) if (freq.get(s[i]) === 1) return i;
  return -1;
}
```

### Validasi format sederhana tanpa regex: nomor HP Indonesia

```dart
bool isValidIdPhone(String input) {
  final s = input.replaceAll(RegExp(r'[\s-]'), '');
  final normalized = s.startsWith('+62') ? '0${s.substring(3)}' : s.startsWith('62') ? '0${s.substring(2)}' : s;
  if (!normalized.startsWith('08')) return false;
  if (normalized.length < 10 || normalized.length > 13) return false;
  return normalized.codeUnits.every((c) => c >= 48 && c <= 57);
}
```

## Best Practices

- **Tanyakan batasan**: ukuran n, ada angka negatif?, boleh ubah input?, karakter ASCII atau Unicode?
- **Tulis brute force dulu secara lisan**, lalu optimasi dengan pola.
- **Uji edge case**: kosong, satu elemen, semua sama, semua negatif, string dengan spasi/emoji.
- **Gunakan nama variabel bermakna** (`slow/fast`, `left/right`, `windowSum`).
- **StringBuffer/join** untuk menyusun string panjang.

## Anti-Patterns

- `list.contains()` / `indexOf` di dalam loop → O(n²) tersembunyi.
- Mengubah list saat di-iterasi dengan `for-in`.
- Konkatenasi string di loop besar.
- Lupa kasus array kosong (`a[0]` langsung error).
- Mengandalkan `substring` berulang di loop (membuat banyak string baru).

## Performance Considerations

- O(n) satu kali jalan hampir selalu cukup untuk n ≤ 10⁶.
- Sorting O(n log n) sering menyederhanakan solusi; sebutkan trade-off jika input boleh diubah.
- Untuk huruf a–z, array berukuran 26 lebih cepat dan hemat dari hash map.
- Dart: `codeUnits` lebih cepat untuk perbandingan karakter daripada `split('')`.

## Security Considerations

Dalam kode produksi, manipulasi string dari input user perlu: batas panjang, normalisasi (trim, Unicode), dan validasi
format — juga menghindari regex rawan *catastrophic backtracking* (ReDoS).

## Real-World Use Cases

- Prefix sum untuk total penjualan rentang tanggal; sliding window untuk rata-rata bergerak.
- Normalisasi nomor HP/NIK sebelum disimpan.
- Kompresi/format nomor struk dan kode produk.

## Interview Questions

1. Balik array in-place tanpa array tambahan.
2. Hapus duplikat dari array terurut in-place.
3. Temukan subarray berurutan dengan jumlah maksimum.
4. Hitung jumlah subarray yang jumlahnya k.
5. Kompres string "aaabbc" menjadi "a3b2c1".
6. Cari karakter pertama yang tidak berulang.

## Sample Answers

1. Two pointers dari kedua ujung, tukar, geser ke tengah — O(n) waktu, O(1) ruang.
2. Pointer `slow` menandai posisi elemen unik terakhir; `fast` memindai; jika berbeda, salin ke `++slow` — O(n), O(1).
3. Kadane: untuk setiap elemen pilih mulai baru atau lanjutkan subarray (`max(x, cur + x)`), simpan maksimum — O(n).
4. Prefix sum + hash map frekuensi; untuk setiap prefix `sum`, tambahkan jumlah prefix sebelumnya yang bernilai `sum − k` — O(n), benar untuk angka negatif (sliding window tidak).
5. Iterasi, hitung run karakter yang sama, tulis karakter + jumlah ke StringBuffer saat karakter berganti — O(n).
6. Hitung frekuensi semua karakter, lalu iterasi lagi dan kembalikan indeks pertama dengan frekuensi 1 — O(n).

## Practical Exercises

1. Rotate array ke kanan sebanyak k langkah in-place (petunjuk: reverse tiga kali).
2. Gabungkan dua array terurut menjadi satu terurut.
3. Cek apakah string `s` adalah rotasi dari `t` (petunjuk: `(t + t).contains(s)` + panjang sama).
4. Substring terpanjang dengan paling banyak 2 karakter berbeda (sliding window + map).

<details>
<summary>Petunjuk solusi nomor 1</summary>

`k = k % n` → reverse seluruh array → reverse `0..k-1` → reverse `k..n-1`. O(n) waktu, O(1) ruang.
</details>

## Quick Reference

```text
Lookup → Map/Set · Terurut/ujung → two pointers · Berurutan + syarat → sliding window
Jumlah rentang → prefix sum · Huruf a–z → int[26] · Sort bila urutan tidak penting
Edge: kosong · 1 elemen · semua sama · negatif · Unicode · StringBuffer/join
```

## Related Topics

- [Problem Solving Framework & Big-O](/interview/coding-test/problem-solving-framework/)
- [Hash Map & Set](/interview/coding-test/hashmap-set/)
- [Sorting & Searching](/interview/coding-test/sorting-searching/)
