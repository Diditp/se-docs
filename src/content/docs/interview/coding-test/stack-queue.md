---
title: "Stack & Queue"
description: "Stack (LIFO) dan queue (FIFO), deque, monotonic stack, serta pola soal: kurung seimbang, evaluasi ekspresi, next greater element, queue dengan dua stack, dan BFS."
level: intermediate
status: complete
updated: 2026-11-12
tags: [coding-test, stack, queue, deque, data-structures]
---

## Overview

- **Stack** — *Last In, First Out* (LIFO): `push`, `pop`, `peek` di satu ujung. Seperti tumpukan piring.
- **Queue** — *First In, First Out* (FIFO): `enqueue` di belakang, `dequeue` di depan. Seperti antrian kasir.
- **Deque** — bisa tambah/ambil di kedua ujung.
- **Priority queue** — elemen keluar berdasarkan prioritas (biasanya heap).

## Why It Matters

Stack muncul di soal yang punya struktur **bersarang** atau **"undo terakhir"** (kurung, ekspresi, riwayat navigasi);
queue di soal **pemrosesan berurutan** dan **BFS** (jarak terpendek di grid/graf tak berbobot). Konsep ini juga dipakai
sehari-hari: navigation stack di Flutter, message queue di backend.

## Core Concepts

| Struktur | Operasi | Dart | TypeScript |
| --- | --- | --- | --- |
| Stack | push/pop/peek O(1) | `List` (`add`, `removeLast`, `last`) | `Array` (`push`, `pop`, `at(-1)`) |
| Queue | enqueue/dequeue O(1) | `Queue` dari `dart:collection` (`addLast`, `removeFirst`) | array + indeks head (hindari `shift()` di loop besar) |
| Deque | kedua ujung O(1) | `Queue`/`ListQueue` | implementasi ring buffer / dua stack |
| Priority queue | push/pop O(log n) | `PriorityQueue` (package `collection`) | implementasi heap |

**Monotonic stack** — stack yang isinya selalu naik/turun; dipakai untuk "elemen lebih besar berikutnya", histogram, suhu.

## How It Works

```text
Stack:  push 1, push 2, push 3 → [1,2,3]  pop → 3
Queue:  enqueue 1, 2, 3 → [1,2,3]          dequeue → 1
Monotonic decreasing stack untuk "next greater": simpan indeks yang belum menemukan elemen lebih besar;
saat x datang, pop semua yang < x → jawaban mereka adalah x.
```

## Implementation

### Kurung seimbang

```dart
bool isBalanced(String s) {
  const pair = {')': '(', ']': '[', '}': '{'};
  final stack = <String>[];
  for (final ch in s.split('')) {
    if ('([{'.contains(ch)) {
      stack.add(ch);
    } else if (pair.containsKey(ch)) {
      if (stack.isEmpty || stack.removeLast() != pair[ch]) return false;
    }
  }
  return stack.isEmpty;
}
```

### Evaluasi Reverse Polish Notation (postfix)

```ts
function evalRPN(tokens: string[]): number {
  const st: number[] = [];
  for (const t of tokens) {
    if (['+', '-', '*', '/'].includes(t)) {
      const b = st.pop()!, a = st.pop()!;
      st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b));
    } else st.push(Number(t));
  }
  return st.pop()!;     // ["2","1","+","3","*"] → 9
}
```

### Next greater element (monotonic stack)

```dart
List<int> nextGreater(List<int> a) {
  final res = List<int>.filled(a.length, -1);
  final stack = <int>[];                                  // indeks, nilai menurun
  for (var i = 0; i < a.length; i++) {
    while (stack.isNotEmpty && a[stack.last] < a[i]) {
      res[stack.removeLast()] = a[i];
    }
    stack.add(i);
  }
  return res;                                             // O(n): setiap indeks push & pop sekali
}
// Contoh nyata: "berapa hari sampai penjualan lebih tinggi?" (daily temperatures)
```

### Queue dari dua stack (amortized O(1))

```ts
class TwoStackQueue<T> {
  private inbox: T[] = [];
  private outbox: T[] = [];
  enqueue(x: T) { this.inbox.push(x); }
  dequeue(): T | undefined {
    if (this.outbox.length === 0) while (this.inbox.length) this.outbox.push(this.inbox.pop()!);
    return this.outbox.pop();
  }
}
```

### Min stack (getMin O(1))

```dart
class MinStack {
  final _items = <int>[];
  final _mins = <int>[];
  void push(int x) { _items.add(x); _mins.add(_mins.isEmpty ? x : (x < _mins.last ? x : _mins.last)); }
  int pop() { _mins.removeLast(); return _items.removeLast(); }
  int get min => _mins.last;
}
```

### BFS: jarak terpendek di grid (0 jalan, 1 tembok)

```dart
import 'dart:collection';

int shortestPath(List<List<int>> g) {
  final n = g.length, m = g[0].length;
  if (g[0][0] == 1 || g[n - 1][m - 1] == 1) return -1;
  final dist = List.generate(n, (_) => List.filled(m, -1));
  final q = Queue<(int, int)>()..add((0, 0));
  dist[0][0] = 0;
  const dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)];
  while (q.isNotEmpty) {
    final (r, c) = q.removeFirst();
    for (final (dr, dc) in dirs) {
      final nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= m || g[nr][nc] == 1 || dist[nr][nc] != -1) continue;
      dist[nr][nc] = dist[r][c] + 1;
      q.add((nr, nc));
    }
  }
  return dist[n - 1][m - 1];
}
```

## Best Practices

- **Stack untuk struktur bersarang, undo, DFS iteratif**; **queue untuk urutan & BFS**.
- **Simpan indeks, bukan nilai**, di monotonic stack bila jawaban butuh posisi.
- **Gunakan struktur yang tepat**: `Queue` Dart, bukan `List.removeAt(0)` (O(n)).
- **Cek kosong sebelum pop/peek**.

## Anti-Patterns

- `Array.shift()` di JS / `removeAt(0)` di Dart dalam loop besar → O(n²).
- Rekursi sangat dalam yang sebenarnya bisa dibuat iteratif dengan stack (risiko stack overflow).
- Lupa menandai node "visited" saat dimasukkan ke queue BFS → node diproses berkali-kali.

## Performance Considerations

- Operasi stack/queue O(1); kompleksitas total biasanya O(n) karena setiap elemen masuk–keluar sekali.
- BFS pada grid n×m: O(n·m) waktu & ruang.
- Priority queue (heap) O(log n) per operasi — untuk Dijkstra, penjadwalan, top-k.

## Security Considerations

Queue tanpa batas di sistem nyata dapat menghabiskan memori saat producer lebih cepat dari consumer — gunakan
*bounded queue* dan backpressure; di backend gunakan message broker dengan batas & dead-letter queue.

## Real-World Use Cases

- Navigation stack (push/pop halaman), undo/redo editor.
- Antrian job/background task (FIFO) dan antrian prioritas notifikasi.
- BFS untuk mencari rute terpendek pada peta grid/gudang.

## Interview Questions

1. Apa beda stack dan queue? Beri contoh penggunaannya.
2. Validasi kurung seimbang.
3. Implementasikan queue menggunakan dua stack dan analisis kompleksitasnya.
4. Temukan next greater element untuk setiap elemen.
5. Kapan memakai BFS dan mengapa memakai queue?

## Sample Answers

1. Stack LIFO (undo, call stack, DFS, kurung); queue FIFO (antrian pemrosesan, BFS, buffer).
2. Push kurung buka ke stack; saat kurung tutup, stack harus tidak kosong dan top cocok; akhir string stack harus kosong — O(n).
3. Push ke `inbox`; saat dequeue dan `outbox` kosong, pindahkan semua dari `inbox` ke `outbox` lalu pop. Setiap elemen dipindah sekali → amortized O(1).
4. Monotonic stack menyimpan indeks dengan nilai menurun; saat elemen baru lebih besar, pop dan isi jawaban untuk indeks tersebut — O(n).
5. BFS untuk jarak terpendek pada graf/grid tak berbobot karena menjelajah per level; queue menjamin node diproses sesuai urutan jarak.

## Practical Exercises

1. Hapus duplikat bersebelahan berulang dari string ("abbaca" → "ca") dengan stack.
2. Implementasikan sliding window maximum dengan deque (O(n)).
3. Hitung jumlah pulau pada grid dengan BFS.

## Quick Reference

```text
Stack LIFO (List add/removeLast) · Queue FIFO (dart:collection Queue) · Deque · Priority queue (heap)
Pola: kurung/ekspresi → stack · next greater → monotonic stack · jarak terpendek tak berbobot → BFS + queue
Queue dari 2 stack = amortized O(1) · hindari shift()/removeAt(0) di loop
```

## Related Topics

- [Data Structures Overview](/interview/coding-test/data-structures/)
- [Recursion](/interview/coding-test/recursion/)
- [Message Queue (System Design)](/system-design/concepts/message-queue/)
