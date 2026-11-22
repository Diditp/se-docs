---
title: "Data Structures Overview"
description: "Ringkasan struktur data untuk interview: array, linked list, stack, queue, hash map, tree/BST, heap, trie, dan graph — operasi, kompleksitas, kapan dipakai, plus contoh implementasi inti."
level: intermediate
status: complete
updated: 2026-11-12
tags: [coding-test, data-structures, linked-list, tree, heap, graph, trie]
---

## Overview

Memilih **struktur data** yang tepat sering lebih penting daripada algoritma yang rumit. Halaman ini merangkum struktur
data yang paling sering ditanyakan, kompleksitas operasinya, dan kapan memakainya — sebagai peta sebelum mengerjakan soal.

## Why It Matters

Interviewer menilai apakah Anda bisa menjawab "kenapa struktur ini?" dengan argumen kompleksitas dan trade-off. Dalam
pekerjaan nyata, pemahaman ini membantu memilih koleksi di Dart/Kotlin/TS, desain index database, dan cache.

## Core Concepts

| Struktur | Akses | Cari | Sisip | Hapus | Kapan dipakai |
| --- | --- | --- | --- | --- | --- |
| Array / List dinamis | O(1) | O(n) | O(1)* akhir, O(n) tengah | O(n) | Akses indeks, iterasi |
| Linked list | O(n) | O(n) | O(1) bila punya node | O(1) bila punya node | Sisip/hapus sering di tengah, LRU |
| Stack / Queue | O(1) ujung | – | O(1) | O(1) | LIFO/FIFO, BFS/DFS |
| Hash map / set | – | O(1) avg | O(1) avg | O(1) avg | Lookup, frekuensi, dedup |
| BST seimbang | – | O(log n) | O(log n) | O(log n) | Data terurut + range query (`TreeMap`, B-tree index) |
| Heap (priority queue) | min/max O(1) | O(n) | O(log n) | O(log n) pop | Top-k, penjadwalan, Dijkstra |
| Trie | – | O(L) | O(L) | O(L) | Autocomplete, prefix search |
| Graph (adjacency list) | – | BFS/DFS O(V+E) | O(1) | – | Relasi, rute, dependensi |

\* amortized. L = panjang kata.

## How It Works

```text
Linked list : [A] → [B] → [C] → null          (node menyimpan nilai + pointer next)
BST         :        8                         kiri < node < kanan → cari O(h)
                   /   \
                  3     10
Min-heap    : array [1, 3, 2, 7, 4]  parent(i) = (i-1)/2, child = 2i+1, 2i+2
Trie        : root → k → o → p → i(*)          (* = akhir kata "kopi")
Graph       : { A: [B, C], B: [D], C: [D] }     adjacency list
```

## Implementation

### Linked list: reverse & deteksi cycle

```ts
class ListNode { constructor(public val: number, public next: ListNode | null = null) {} }

function reverseList(head: ListNode | null): ListNode | null {
  let prev: ListNode | null = null;
  while (head) { const next = head.next; head.next = prev; prev = head; head = next; }
  return prev;
}

function hasCycle(head: ListNode | null): boolean {   // Floyd: slow 1 langkah, fast 2 langkah
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow!.next; fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}
```

### Binary tree: traversal & kedalaman

```dart
class TreeNode {
  TreeNode(this.val, [this.left, this.right]);
  final int val;
  TreeNode? left, right;
}

int maxDepth(TreeNode? n) => n == null ? 0 : 1 + [maxDepth(n.left), maxDepth(n.right)].reduce((a, b) => a > b ? a : b);

void inorder(TreeNode? n, List<int> out) {            // BST → hasil terurut
  if (n == null) return;
  inorder(n.left, out); out.add(n.val); inorder(n.right, out);
}

bool isValidBst(TreeNode? n, [int? min, int? max]) {
  if (n == null) return true;
  if ((min != null && n.val <= min) || (max != null && n.val >= max)) return false;
  return isValidBst(n.left, min, n.val) && isValidBst(n.right, n.val, max);
}
```

### Min-heap sederhana (top-k)

```ts
class MinHeap {
  private a: number[] = [];
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(x: number) {
    const a = this.a; a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= a[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop(): number | undefined {
    const a = this.a; if (!a.length) return undefined;
    const top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l] < a[m]) m = l;
        if (r < a.length && a[r] < a[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// k nilai terbesar dalam O(n log k): simpan heap berukuran k
function topK(nums: number[], k: number): number[] {
  const h = new MinHeap();
  for (const x of nums) { h.push(x); if (h.size > k) h.pop(); }
  const res: number[] = []; while (h.size) res.push(h.pop()!);
  return res.reverse();
}
```

### Trie untuk autocomplete produk

```dart
class TrieNode {
  final children = <String, TrieNode>{};
  bool isWord = false;
}

class Trie {
  final _root = TrieNode();
  void insert(String word) {
    var node = _root;
    for (final ch in word.toLowerCase().split('')) {
      node = node.children.putIfAbsent(ch, TrieNode.new);
    }
    node.isWord = true;
  }

  List<String> withPrefix(String prefix, {int limit = 10}) {
    var node = _root;
    for (final ch in prefix.toLowerCase().split('')) {
      final next = node.children[ch];
      if (next == null) return [];
      node = next;
    }
    final out = <String>[];
    void dfs(TrieNode n, String acc) {
      if (out.length >= limit) return;
      if (n.isWord) out.add(acc);
      n.children.forEach((ch, child) => dfs(child, acc + ch));
    }
    dfs(node, prefix.toLowerCase());
    return out;
  }
}
```

### Graph: urutan build modul (topological sort, Kahn)

```ts
function buildOrder(deps: Record<string, string[]>): string[] | null {
  // deps: modul → modul yang harus dibangun lebih dulu
  const indeg = new Map<string, number>(), next = new Map<string, string[]>();
  for (const [m, pre] of Object.entries(deps)) {
    indeg.set(m, indeg.get(m) ?? 0);
    for (const p of pre) {
      indeg.set(p, indeg.get(p) ?? 0);
      indeg.set(m, indeg.get(m)! + 1);
      next.set(p, [...(next.get(p) ?? []), m]);
    }
  }
  const q = [...indeg].filter(([, d]) => d === 0).map(([m]) => m);
  const order: string[] = [];
  for (let i = 0; i < q.length; i++) {
    order.push(q[i]);
    for (const m of next.get(q[i]) ?? []) {
      indeg.set(m, indeg.get(m)! - 1);
      if (indeg.get(m) === 0) q.push(m);
    }
  }
  return order.length === indeg.size ? order : null;   // null = ada siklus dependensi
}
```

## Best Practices

- **Mulai dari operasi yang dominan**: lebih sering baca? cari? sisip? urut? → pilih struktur yang membuatnya murah.
- **Pakai koleksi bawaan** (`Map`, `Set`, `Queue`, `SplayTreeMap` di Dart; `PriorityQueue`, `TreeMap` di Kotlin/Java) sebelum menulis sendiri.
- **Sebutkan trade-off** waktu vs memori secara eksplisit di interview.
- **Gambar struktur** (node & pointer) saat menjelaskan linked list/tree.

## Anti-Patterns

- Linked list untuk akses indeks acak (O(n) per akses, cache-unfriendly).
- BST tanpa balancing pada data terurut → menjadi linked list (O(n)).
- Sort ulang seluruh list untuk mengambil minimum berkali-kali (gunakan heap).
- Menyimpan graph sebagai adjacency matrix untuk graph besar yang jarang (O(V²) memori).

## Performance Considerations

- Kompleksitas Big-O tidak menceritakan segalanya: array kontigu sangat ramah cache CPU dan sering lebih cepat dari linked list meski Big-O sama.
- Hash map punya overhead memori; untuk data kecil, list linear bisa lebih cepat.
- Index database (B-tree) adalah penerapan tree seimbang di disk: O(log n) dengan fan-out besar.

## Security Considerations

Struktur yang tumbuh dari input pengguna (trie, graph, cache) harus dibatasi ukurannya agar tidak menjadi vektor
kehabisan memori; validasi input sebelum dimasukkan.

## Real-World Use Cases

- **Trie**: autocomplete pencarian produk di POS.
- **Heap**: antrian prioritas notifikasi/job, top-k produk terlaris.
- **Graph + topological sort**: urutan migrasi database, dependensi modul/paket, alur approval.
- **Linked list + hash map**: LRU cache.
- **B-tree**: index PostgreSQL.

## Interview Questions

1. Kapan memilih linked list dibanding array?
2. Bagaimana mendeteksi cycle pada linked list tanpa memori tambahan?
3. Apa itu heap dan bagaimana menemukan k elemen terbesar secara efisien?
4. Bagaimana memvalidasi binary search tree?
5. Struktur data apa untuk fitur autocomplete?
6. Bagaimana menentukan urutan build modul yang saling bergantung?

## Sample Answers

1. Linked list cocok bila sering sisip/hapus di tengah dan sudah memegang referensi node, serta tidak butuh akses indeks; array lebih baik untuk akses acak dan iterasi (cache-friendly).
2. Algoritma Floyd: pointer lambat 1 langkah dan cepat 2 langkah; jika bertemu ada cycle — O(n) waktu, O(1) ruang.
3. Heap adalah complete binary tree dengan sifat parent ≤ child (min-heap) yang disimpan di array. Untuk top-k, pertahankan min-heap berukuran k; buang minimum saat melebihi k — O(n log k).
4. Rekursi dengan batas bawah/atas: setiap node harus berada di rentang `(min, max)` yang diwariskan dari leluhurnya; membandingkan hanya dengan anak langsung tidak cukup.
5. Trie (prefix tree): pencarian prefix O(L) lalu DFS untuk mengumpulkan kata; dalam skala besar bisa didukung index database/search engine.
6. Modelkan sebagai directed graph lalu topological sort (Kahn: proses node indegree 0 memakai queue); jika tidak semua node terproses berarti ada siklus.

## Practical Exercises

1. Gabungkan dua linked list terurut.
2. Level-order traversal binary tree (BFS) yang mengembalikan list per level.
3. Temukan elemen terkecil ke-k di BST.
4. Hitung jumlah komponen terhubung pada graph pertemanan.

## Quick Reference

```text
Array: akses O(1) · LinkedList: sisip O(1) bila punya node · Map/Set: O(1) avg
BST seimbang: O(log n) + terurut · Heap: min/max O(1), push/pop O(log n) · Trie: O(L) prefix
Graph: adjacency list, BFS/DFS O(V+E), topo sort untuk dependensi
Floyd cycle · inorder BST = terurut · top-k = heap ukuran k
```

## Related Topics

- [Hash Map & Set](/interview/coding-test/hashmap-set/)
- [Stack & Queue](/interview/coding-test/stack-queue/)
- [Recursion & Backtracking](/interview/coding-test/recursion/)
- [Indexing (database)](/database/indexing/)
