---
title: "Recursion & Backtracking"
description: "Rekursi dari dasar: base case, call stack, rekursi vs iterasi, memoization, divide & conquer, dan backtracking (subset, permutasi), dengan contoh Dart/TypeScript dan analisis kompleksitas."
level: intermediate
status: complete
updated: 2026-11-12
tags: [coding-test, recursion, backtracking, memoization, dynamic-programming]
---

## Overview

**Rekursi** adalah fungsi yang memanggil dirinya sendiri untuk menyelesaikan versi masalah yang lebih kecil. Setiap
fungsi rekursif punya dua bagian: **base case** (kapan berhenti) dan **recursive case** (bagaimana memperkecil masalah).
**Backtracking** adalah rekursi yang mencoba pilihan, lalu membatalkannya untuk mencoba pilihan lain.

## Why It Matters

Rekursi adalah dasar untuk tree/graph traversal, divide & conquer (merge sort, quick sort), dan dynamic programming.
Interviewer menilai apakah Anda bisa menentukan base case, menghitung kompleksitas, dan tahu kapan rekursi berbahaya
(stack overflow, perhitungan berulang).

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Base case | Kondisi berhenti; tanpa ini → rekursi tak berujung |
| Call stack | Setiap pemanggilan menyimpan frame; kedalaman besar → stack overflow |
| Memoization | Simpan hasil sub-masalah agar tidak dihitung ulang (top-down DP) |
| Tabulation | Isi tabel dari sub-masalah terkecil secara iteratif (bottom-up DP) |
| Divide & conquer | Bagi → selesaikan → gabungkan (merge sort, binary search) |
| Backtracking | Pilih → rekursi → batalkan pilihan (subset, permutasi, N-Queens) |

**Kompleksitas** rekursi ≈ jumlah pemanggilan × kerja per pemanggilan. Ruang ≈ kedalaman rekursi (+ memo).

## How It Works

```text
factorial(3)
 └─ 3 * factorial(2)
         └─ 2 * factorial(1)
                 └─ 1   ← base case
Stack di-"unwind": 1 → 2 → 6

fib(5) naif memanggil fib(3) 2x, fib(2) 3x ... → O(2^n). Dengan memo → O(n).
```

## Implementation

### Faktorial & penjumlahan digit

```dart
int factorial(int n) => n <= 1 ? 1 : n * factorial(n - 1);

int digitSum(int n) => n < 10 ? n : (n % 10) + digitSum(n ~/ 10);   // 1234 → 10
```

### Fibonacci: naif vs memo vs iteratif

```ts
// ❌ O(2^n)
const fibNaive = (n: number): number => (n < 2 ? n : fibNaive(n - 1) + fibNaive(n - 2));

// ✅ Memoization O(n) waktu, O(n) ruang
function fibMemo(n: number, memo = new Map<number, number>()): number {
  if (n < 2) return n;
  if (memo.has(n)) return memo.get(n)!;
  const v = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
  memo.set(n, v);
  return v;
}

// ✅ Iteratif O(n) waktu, O(1) ruang — paling aman untuk n besar
function fibIter(n: number): number {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}
```

### Pangkat cepat (divide & conquer) — O(log n)

```dart
int power(int base, int exp) {
  if (exp == 0) return 1;
  final half = power(base, exp ~/ 2);
  return exp.isEven ? half * half : half * half * base;
}
```

### Rekursi pada struktur bersarang: total harga kategori bertingkat

```ts
interface Category { name: string; items: number[]; children: Category[] }

function totalPrice(c: Category): number {
  const own = c.items.reduce((s, x) => s + x, 0);
  return own + c.children.reduce((s, child) => s + totalPrice(child), 0);
}
```

### Backtracking: semua subset

```dart
List<List<int>> subsets(List<int> nums) {
  final result = <List<int>>[];
  final current = <int>[];
  void dfs(int i) {
    if (i == nums.length) { result.add([...current]); return; }   // salin!
    current.add(nums[i]);       // pilih
    dfs(i + 1);
    current.removeLast();       // batalkan
    dfs(i + 1);                 // tidak pilih
  }
  dfs(0);
  return result;                // O(n · 2^n)
}
```

### Backtracking: permutasi

```ts
function permutations<T>(items: T[]): T[][] {
  const res: T[][] = [];
  const used = new Array(items.length).fill(false);
  const cur: T[] = [];
  const dfs = () => {
    if (cur.length === items.length) { res.push([...cur]); return; }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(items[i]);
      dfs();
      cur.pop(); used[i] = false;
    }
  };
  dfs();
  return res;                   // O(n · n!)
}
```

### Kombinasi nominal: banyak cara membayar dengan pecahan uang (memo/DP)

```dart
int countWays(List<int> coins, int amount) {
  final ways = List<int>.filled(amount + 1, 0)..[0] = 1;
  for (final c in coins) {
    for (var x = c; x <= amount; x++) {
      ways[x] += ways[x - c];
    }
  }
  return ways[amount];          // O(coins · amount), bottom-up tanpa risiko stack overflow
}
```

## Best Practices

- **Tulis base case dulu**, pastikan setiap pemanggilan bergerak menuju base case.
- **Gambar pohon rekursi** untuk n kecil guna menghitung kompleksitas dan melihat sub-masalah berulang.
- **Tambahkan memo** saat sub-masalah tumpang tindih; ubah ke iteratif bila kedalaman bisa besar.
- **Salin state** (`[...current]`) saat menyimpan hasil backtracking.
- **Pangkas (prune)** cabang yang pasti gagal untuk mempercepat backtracking.

## Anti-Patterns

- Tidak ada base case atau base case yang tidak pernah tercapai.
- Fibonacci naif untuk n besar (eksponensial).
- Menyimpan referensi list yang terus dimodifikasi pada backtracking (semua hasil jadi sama/kosong).
- Rekursi dalam ribuan level di Dart/JS pada data dari user (stack overflow) — gunakan stack eksplisit.

## Performance Considerations

- Batas kedalaman stack di JS/Dart terbatas (umumnya ribuan–puluhan ribu frame, bergantung platform) — jangan andalkan *tail call optimization* (tidak tersedia secara umum di kedua runtime).
- Memo menukar memori dengan waktu; bottom-up sering lebih hemat memori.
- Backtracking eksponensial — cocok hanya untuk n kecil (≈ ≤ 20 untuk subset, ≤ 10 untuk permutasi).

## Security Considerations

Rekursi pada input dari luar (JSON bersarang, struktur tree dari user) dapat dimanfaatkan untuk menghabiskan stack/CPU.
Batasi kedalaman dan ukuran input, terutama di backend.

## Real-World Use Cases

- Menelusuri kategori/menu bertingkat, struktur folder, komentar bersarang.
- Widget tree Flutter dan DOM ditelusuri secara rekursif.
- Menghitung kombinasi promo/paket, perhitungan pecahan uang kembalian.

## Interview Questions

1. Apa dua komponen wajib fungsi rekursif?
2. Mengapa Fibonacci rekursif naif lambat dan bagaimana memperbaikinya?
3. Kapan memilih iterasi daripada rekursi?
4. Hasilkan semua subset dari sebuah himpunan.
5. Apa perbedaan memoization dan tabulation?

## Sample Answers

1. Base case yang menghentikan rekursi dan recursive case yang memperkecil masalah menuju base case.
2. Sub-masalah dihitung berulang sehingga O(2ⁿ). Memoization menyimpan hasil per n → O(n); versi iteratif O(n) waktu dan O(1) ruang.
3. Saat kedalaman bisa sangat besar (risiko stack overflow), saat performa kritis, atau ketika solusi iteratif sama jelasnya. Rekursi cocok untuk struktur alami bersarang (tree, divide & conquer).
4. Backtracking: untuk setiap elemen pilih masuk atau tidak, rekursi ke indeks berikutnya, salin `current` ke hasil di akhir — O(n · 2ⁿ).
5. Memoization top-down (rekursi + cache, hanya menghitung sub-masalah yang dibutuhkan); tabulation bottom-up (loop mengisi tabel dari kasus terkecil, tanpa overhead rekursi).

## Practical Exercises

1. Balik string secara rekursif dan iteratif; bandingkan.
2. Ratakan list bersarang `[1,[2,[3,4]],5]` → `[1,2,3,4,5]`.
3. Hitung jumlah jalur dari kiri-atas ke kanan-bawah grid m×n (hanya kanan/bawah) dengan memo.
4. Hasilkan semua kombinasi kurung valid untuk n pasang.

## Quick Reference

```text
Rekursi = base case + recursive case · ruang = kedalaman · waktu = #panggilan × kerja
Sub-masalah berulang → memo (top-down) / tabulation (bottom-up)
Backtracking: pilih → dfs → batalkan · salin state saat simpan · prune
Kedalaman besar/input user → iteratif + stack eksplisit
```

## Related Topics

- [Sorting & Searching](/interview/coding-test/sorting-searching/)
- [Stack & Queue](/interview/coding-test/stack-queue/)
- [Data Structures Overview](/interview/coding-test/data-structures/)
