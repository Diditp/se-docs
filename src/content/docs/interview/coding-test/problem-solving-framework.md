---
title: "Problem Solving Framework & Big-O"
description: "Langkah sistematis menyelesaikan soal coding test, analisis kompleksitas waktu & ruang, dan pola-pola umum (two pointers, sliding window, hash map, stack) dengan contoh Dart dan TypeScript."
level: beginner
status: complete
updated: 2026-11-07
tags: [coding-test, algorithms, big-o, data-structures, problem-solving]
---

## Overview

Coding test menilai **cara berpikir**, bukan hanya jawaban akhir: memahami masalah, memilih struktur data, menulis kode
yang benar, menguji edge case, dan menjelaskan kompleksitas. Framework yang konsisten mencegah panik dan kesalahan ceroboh.

## Why It Matters

- Banyak proses seleksi memakai tes online (HackerRank/Codility-style) atau live coding.
- Soal tingkat masuk–menengah didominasi **array/string, hash map, sorting, stack/queue, rekursi**, dan **SQL** — bukan algoritma eksotis.
- Pola yang sama (hash map untuk lookup O(1), two pointers, sliding window) menyelesaikan sebagian besar soal tersebut.

## Core Concepts

### Big-O — pertumbuhan biaya terhadap ukuran input n

| Kompleksitas | Nama | Contoh | n = 10⁵ (≈ operasi) |
| --- | --- | --- | --- |
| O(1) | Konstan | Akses array by index, HashMap get | 1 |
| O(log n) | Logaritmik | Binary search | ~17 |
| O(n) | Linear | Satu kali loop | 10⁵ |
| O(n log n) | Linearitmik | Sorting efisien | ~1,7 × 10⁶ |
| O(n²) | Kuadratik | Dua loop bersarang | 10¹⁰ ❌ (terlalu lambat) |
| O(2ⁿ) | Eksponensial | Semua subset | ❌ |

Aturan praktis: ~10⁸ operasi sederhana per detik. Dari batas input Anda bisa menebak kompleksitas yang diharapkan:
n ≤ 10³ → O(n²) masih aman; n ≤ 10⁵–10⁶ → butuh O(n) atau O(n log n).

**Space complexity** — memory tambahan yang dipakai (hash map berukuran n = O(n)).

### Struktur data yang wajib dikuasai

| Struktur | Operasi kunci | Dart | TypeScript |
| --- | --- | --- | --- |
| Array/List | index O(1), insert tengah O(n) | `List` | `Array` |
| Hash map | get/put O(1) rata-rata | `Map` | `Map` |
| Hash set | contains O(1) rata-rata | `Set` | `Set` |
| Stack | push/pop O(1) | `List` (add/removeLast) | `Array` (push/pop) |
| Queue | enqueue/dequeue O(1) | `Queue` (`dart:collection`) | array + index head |

## How It Works

**Framework UMPIRE (disederhanakan) — ucapkan dengan keras saat live coding:**

1. **Understand** — ulangi soal dengan kata sendiri; tanyakan batas input, tipe data, duplikat, nilai negatif, input kosong, format output.
2. **Match** — kenali pola: perlu lookup cepat? (hash map) data terurut? (two pointers/binary search) subarray berurutan? (sliding window) pasangan kurung/undo? (stack).
3. **Plan** — tulis langkah dalam pseudocode; sebut solusi brute force dulu beserta kompleksitasnya, lalu optimasi.
4. **Implement** — kode bersih, nama variabel jelas, fungsi kecil.
5. **Review** — jalankan manual dengan contoh kecil & edge case.
6. **Evaluate** — nyatakan kompleksitas waktu & ruang; sebut trade-off/alternatif.

## Implementation

### Pola 1 — Hash map: Two Sum (O(n))

```dart
List<int>? twoSum(List<int> nums, int target) {
  final seen = <int, int>{}; // nilai -> index
  for (var i = 0; i < nums.length; i++) {
    final need = target - nums[i];
    final j = seen[need];
    if (j != null) return [j, i];
    seen[nums[i]] = i;
  }
  return null;
}
```

### Pola 2 — Frekuensi: apakah dua string anagram? (O(n))

```ts
function isAnagram(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const freq = new Map<string, number>();
  for (const ch of a) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  for (const ch of b) {
    const n = freq.get(ch);
    if (!n) return false;
    freq.set(ch, n - 1);
  }
  return true;
}
```

### Pola 3 — Two pointers: palindrome mengabaikan non-alfanumerik (O(n), O(1) space)

```dart
bool isPalindrome(String s) {
  bool isAlnum(int c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  final t = s.toLowerCase().codeUnits;
  var i = 0, j = t.length - 1;
  while (i < j) {
    if (!isAlnum(t[i])) { i++; continue; }
    if (!isAlnum(t[j])) { j--; continue; }
    if (t[i] != t[j]) return false;
    i++; j--;
  }
  return true;
}
```

### Pola 4 — Sliding window: substring terpanjang tanpa karakter berulang (O(n))

```ts
function longestUniqueSubstring(s: string): number {
  const lastIndex = new Map<string, number>();
  let start = 0, best = 0;
  for (let end = 0; end < s.length; end++) {
    const prev = lastIndex.get(s[end]);
    if (prev !== undefined && prev >= start) start = prev + 1;   // geser awal window
    lastIndex.set(s[end], end);
    best = Math.max(best, end - start + 1);
  }
  return best;
}
```

### Pola 5 — Stack: kurung seimbang (O(n))

```dart
bool isBalanced(String s) {
  const pairs = {')': '(', ']': '[', '}': '{'};
  final stack = <String>[];
  for (final ch in s.split('')) {
    if ('([{'.contains(ch)) {
      stack.add(ch);
    } else if (pairs.containsKey(ch)) {
      if (stack.isEmpty || stack.removeLast() != pairs[ch]) return false;
    }
  }
  return stack.isEmpty;
}
```

### Pola 6 — Binary search pada data terurut (O(log n))

```ts
function lowerBound(arr: number[], target: number): number {   // index pertama >= target
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (arr[mid] < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}
```

## Best Practices

- **Klarifikasi dulu, kode kemudian** — 2 menit bertanya menghemat 20 menit menulis solusi untuk soal yang salah.
- **Brute force yang benar > solusi optimal yang salah**; nyatakan lalu tingkatkan.
- **Tangani edge case eksplisit**: kosong, satu elemen, semua sama, negatif, overflow, Unicode.
- **Gunakan struktur data bawaan bahasa** dan ketahui kompleksitasnya.
- **Tes manual dengan contoh kecil** sebelum menyatakan selesai.
- **Latih dalam bahasa yang akan dipakai saat tes** (Dart, Kotlin, JS/TS, atau Python bila diizinkan) — kuasai API string/collection-nya.

## Anti-Patterns

- Langsung mengetik tanpa rencana; diam total saat live coding.
- Menghafal solusi tanpa memahami pola → gagal saat soal sedikit dimodifikasi.
- Mengoptimasi mikro (bit trick) sebelum kompleksitas algoritma benar.
- Mengabaikan batas input sehingga O(n²) timeout.
- Mengubah input yang tidak boleh diubah tanpa menyebutkannya.

## Performance Considerations

- `list.contains` / `indexOf` di dalam loop = O(n²) tersembunyi → ganti dengan `Set`.
- Konkatenasi string berulang di loop → gunakan `StringBuffer` (Dart) / array + `join` (JS).
- `list.removeAt(0)` O(n) → gunakan `Queue`/deque.
- Sorting O(n log n) sering cukup dan menyederhanakan solusi.

## Security Considerations

Di soal real-world (bukan algoritma murni), sebutkan validasi input, batas ukuran, dan perilaku untuk input berbahaya —
menunjukkan pola pikir engineer produksi. Contoh: parsing input user → validasi format dan panjang sebelum diproses.

## Real-World Use Cases

- Hash map/set: deduplikasi transaksi saat sync, lookup produk by SKU.
- Sliding window: rate limiting, metrik rata-rata bergerak.
- Stack: undo/redo di editor, parsing ekspresi.
- Binary search: mencari versi pertama yang rusak (prinsip `git bisect`), harga tier.

## Interview Questions

1. Apa itu Big-O dan mengapa penting?
2. Berapa kompleksitas HashMap get dan kapan bisa memburuk?
3. Two Sum dalam O(n) — jelaskan dan analisis.
4. Bagaimana membalik string/array in-place?
5. Kapan memakai stack vs queue?
6. Jelaskan binary search dan syaratnya.

## Sample Answers

1. Notasi untuk menggambarkan bagaimana waktu/memory bertumbuh terhadap ukuran input pada kasus terburuk (atau rata-rata bila disebutkan). Penting untuk memprediksi apakah solusi masih layak saat data membesar.
2. Rata-rata O(1); worst case O(n) bila banyak collision (atau O(log n) pada implementasi yang memakai tree bin seperti Java 8+). Hash function yang baik dan resize menjaga rata-rata tetap O(1).
3. Satu kali iterasi; untuk setiap angka cek apakah `target - x` sudah ada di map; jika ya kembalikan pasangan, jika tidak simpan x. Waktu O(n), ruang O(n) — menukar memory dengan kecepatan dari brute force O(n²).
4. Two pointers dari ujung kiri dan kanan, tukar, geser ke tengah sampai bertemu — O(n) waktu, O(1) ruang.
5. Stack (LIFO) untuk proses bersarang/undo/DFS; queue (FIFO) untuk antrian pemrosesan berurutan dan BFS.
6. Pada data terurut, bandingkan elemen tengah dan buang separuh ruang pencarian setiap langkah — O(log n). Syarat: data terurut (atau fungsi monoton); hati-hati batas `lo/hi` dan overflow `mid`.

## Practical Exercises

Kerjakan dengan timer 25 menit per soal, ucapkan framework dengan keras:

1. FizzBuzz, reverse string, hitung vokal (pemanasan).
2. Hapus duplikat dari array terurut in-place.
3. Karakter pertama yang tidak berulang dalam string.
4. Gabungkan dua array terurut.
5. Validasi kurung seimbang.
6. Substring terpanjang tanpa karakter berulang.
7. Kelompokkan anagram.
8. Implementasi queue menggunakan dua stack.

Lanjutkan ke [Array & String](/interview/coding-test/arrays-strings/), [Hash Map & Set](/interview/coding-test/hashmap-set/),
dan [SQL Query Challenges](/interview/coding-test/sql-challenges/).

## Quick Reference

- **Understand → Match → Plan → Implement → Review → Evaluate.**
- Lookup cepat → **Map/Set**. Terurut → **two pointers/binary search**. Subarray → **sliding window**. Bersarang → **stack**.
- n ≤ 10³: O(n²) ok · n ≤ 10⁶: O(n log n) atau O(n).
- Selalu sebut kompleksitas waktu & ruang + edge case.

## Related Topics

- [Data Structures Overview](/interview/coding-test/data-structures/)
- [Sorting & Searching](/interview/coding-test/sorting-searching/)
- [Recursion](/interview/coding-test/recursion/)
- [Dart Fundamentals](/flutter/dart-fundamentals/)
