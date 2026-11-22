---
title: "Hash Map & Set"
description: "Cara kerja hash table, kompleksitas, dan pola soal yang diselesaikan dengan Map/Set: frekuensi, deduplikasi, two sum, grouping, LRU cache — dengan solusi Dart/TypeScript."
level: beginner
status: complete
updated: 2026-11-12
tags: [coding-test, hashmap, set, data-structures]
---

## Overview

**Hash map** (Dart `Map`, JS `Map`, Kotlin `HashMap`) menyimpan pasangan key–value dengan akses rata-rata **O(1)**.
**Hash set** (`Set`) menyimpan elemen unik dengan pengecekan keanggotaan O(1). Keduanya adalah alat paling sering dipakai
untuk mengubah solusi O(n²) menjadi O(n).

## Why It Matters

Banyak soal coding test (two sum, anagram, duplikat, frekuensi, grouping) memiliki solusi brute force O(n²) dan solusi
optimal O(n) dengan hash map. Interviewer juga sering bertanya bagaimana hash map bekerja di dalamnya.

## Core Concepts

| Operasi | Rata-rata | Terburuk |
| --- | --- | --- |
| get / put / remove | O(1) | O(n) (banyak collision) |
| contains (Set) | O(1) | O(n) |
| iterasi | O(n) | O(n) |

- **Hash function** — mengubah key menjadi indeks bucket.
- **Collision** — dua key ke bucket yang sama; ditangani dengan *chaining* (list per bucket) atau *open addressing*.
- **Load factor & resize** — saat terlalu penuh, tabel diperbesar dan elemen di-rehash (amortized O(1)).
- **Key yang baik** harus memiliki `==` dan `hashCode` yang konsisten — objek kustom sebagai key wajib meng-override keduanya.
- **Urutan**: `Map` di Dart (`LinkedHashMap` default) dan JS menjaga urutan sisip; `HashMap` Java/Kotlin tidak.

## How It Works

```text
put("kopi", 18000)
hash("kopi") = 9182734  → index = 9182734 % 16 = 14 → bucket[14] = [("kopi", 18000)]
get("kopi") → hash → bucket[14] → bandingkan key dengan == → 18000
Collision: bucket[14] = [("kopi",18000), ("teh",12000)] → cari linear di bucket kecil
```

## Implementation

### Two Sum (index pasangan)

```dart
List<int>? twoSum(List<int> nums, int target) {
  final seen = <int, int>{};
  for (var i = 0; i < nums.length; i++) {
    final j = seen[target - nums[i]];
    if (j != null) return [j, i];
    seen[nums[i]] = i;
  }
  return null;
}
```

### Duplikat dalam jarak k

```ts
function containsNearbyDuplicate(nums: number[], k: number): boolean {
  const lastIndex = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const prev = lastIndex.get(nums[i]);
    if (prev !== undefined && i - prev <= k) return true;
    lastIndex.set(nums[i], i);
  }
  return false;
}
```

### Kelompokkan anagram

```dart
List<List<String>> groupAnagrams(List<String> words) {
  final groups = <String, List<String>>{};
  for (final w in words) {
    final key = (w.split('')..sort()).join();        // "eat" → "aet"
    groups.putIfAbsent(key, () => []).add(w);
  }
  return groups.values.toList();                      // O(n · m log m), m = panjang kata
}
```

### Elemen yang muncul lebih dari n/2 kali (mayoritas)

```ts
function majority(nums: number[]): number | null {
  const freq = new Map<number, number>();
  for (const x of nums) {
    const c = (freq.get(x) ?? 0) + 1;
    if (c > nums.length / 2) return x;
    freq.set(x, c);
  }
  return null;     // Boyer–Moore voting memberi O(1) ruang bila mayoritas dijamin ada
}
```

### Irisan dua daftar ID (Set)

```dart
Set<String> commonCustomers(List<String> a, List<String> b) => a.toSet().intersection(b.toSet());
```

### LRU Cache (Map menjaga urutan sisip)

```ts
class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private capacity: number) {}
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key)!;
    this.map.delete(key); this.map.set(key, v);        // pindahkan ke paling baru
    return v;
  }
  put(key: K, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value!);   // hapus paling lama
  }
}
```

### Objek kustom sebagai key

```dart
class Sku {
  const Sku(this.outletId, this.code);
  final String outletId;
  final String code;
  @override
  bool operator ==(Object o) => o is Sku && o.outletId == outletId && o.code == code;
  @override
  int get hashCode => Object.hash(outletId, code);   // wajib konsisten dengan ==
}
```

## Best Practices

- **Pikirkan hash map setiap kali ada pertanyaan "sudah pernah lihat?" atau "berapa kali?"**.
- **`putIfAbsent` / `update`** (Dart) atau `?? 0` (TS) untuk menghitung frekuensi dengan ringkas.
- **Pilih key yang tepat** (sorted string, tuple/record, string gabungan `${a}|${b}`).
- **Sebutkan trade-off ruang**: O(n) memori tambahan untuk kecepatan.
- **Gunakan `Set` untuk deduplikasi** daripada `list.contains` berulang.

## Anti-Patterns

- Objek mutable sebagai key lalu diubah setelah dimasukkan → tidak bisa ditemukan lagi.
- Override `==` tanpa `hashCode` (atau sebaliknya).
- Menggunakan object literal JS `{}` sebagai map untuk key dinamis (prototype pollution, key selalu string) — gunakan `Map`.
- Mengandalkan urutan iterasi `HashMap` di bahasa yang tidak menjaminnya.

## Performance Considerations

- O(1) rata-rata bergantung pada fungsi hash yang baik; key dengan hash buruk menurunkan performa.
- Hash map punya overhead memori per entri — untuk domain kecil (huruf a–z, angka 0–1000) array lebih efisien.
- Inisialisasi kapasitas (bila bahasa mendukung) mengurangi resize berulang.

## Security Considerations

- **Hash flooding**: input yang sengaja menghasilkan collision dapat menjadi DoS pada server; runtime modern memakai hash teracak, tetapi tetap batasi ukuran input.
- Di JavaScript, hindari menyalin key dari input ke objek biasa (`obj[userKey] = ...`) — risiko *prototype pollution* (`__proto__`).

## Real-World Use Cases

- Cache produk berdasarkan SKU; dedup transaksi berdasarkan UUID saat sync.
- Menghitung penjualan per kategori (frekuensi/agregasi in-memory).
- LRU cache gambar atau hasil query.

## Interview Questions

1. Bagaimana hash map bekerja secara internal?
2. Mengapa kompleksitas terburuk hash map O(n)?
3. Selesaikan Two Sum dalam O(n).
4. Kelompokkan kata-kata yang merupakan anagram.
5. Rancang LRU cache dengan get/put O(1).
6. Apa syarat objek kustom bisa dipakai sebagai key?

## Sample Answers

1. Key di-hash menjadi indeks bucket dalam array; nilai disimpan di bucket tersebut; collision ditangani dengan chaining atau open addressing; tabel di-resize & rehash saat load factor tinggi.
2. Jika banyak key jatuh ke bucket yang sama, pencarian di bucket menjadi linear. Beberapa implementasi (Java 8+) mengubah bucket besar menjadi tree sehingga terburuk O(log n).
3. Simpan nilai→indeks di map sambil iterasi; untuk setiap x cek `target − x` di map — O(n) waktu, O(n) ruang.
4. Gunakan key kanonik (huruf diurutkan, atau hitungan 26 huruf) di map → list kata.
5. Hash map + doubly linked list (atau Map yang menjaga urutan sisip): get memindahkan entri ke posisi terbaru, put menambahkan dan menghapus entri tertua saat melebihi kapasitas — keduanya O(1).
6. `==` dan `hashCode` di-override secara konsisten dan nilai yang memengaruhinya tidak berubah selama objek ada di map (sebaiknya immutable).

## Practical Exercises

1. Temukan panjang deret bilangan berurutan terpanjang dalam array tak terurut dalam O(n) (petunjuk: Set, mulai hanya dari angka yang tidak punya `x−1`).
2. Cek apakah dua string isomorfik.
3. Hitung jumlah pasangan dengan selisih tepat k.

<details>
<summary>Petunjuk solusi nomor 1</summary>

Masukkan semua angka ke Set. Untuk setiap `x` yang `x − 1` tidak ada di Set, hitung `x, x+1, x+2…` selama ada. Setiap angka
dikunjungi paling banyak dua kali → O(n).
</details>

## Quick Reference

```text
Map: get/put O(1) rata-rata · Set: contains O(1) · terburuk O(n) karena collision
Pola: frekuensi · seen-before · two sum · grouping (key kanonik) · dedup · LRU (map berurutan)
Key kustom: == + hashCode konsisten, immutable · JS: pakai Map, bukan {}
```

## Related Topics

- [Array, List & String](/interview/coding-test/arrays-strings/)
- [Data Structures Overview](/interview/coding-test/data-structures/)
- [Problem Solving Framework](/interview/coding-test/problem-solving-framework/)
