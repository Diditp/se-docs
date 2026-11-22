---
title: "Testing Requirements"
description: "Menuliskan kebutuhan testing yang membuat AI coding agent menghasilkan kode yang terbukti benar: matriks test per jenis perubahan, perintah verifikasi yang persis, test sebagai acceptance criteria, mencegah agent melemahkan atau menghapus test, test yang deterministik, test negatif keamanan, dan cara memverifikasi laporan agent."
level: intermediate
status: complete
updated: 2026-11-13
tags: [ai, agents, testing, definition-of-done, quality]
---

## Overview

Bagi AI coding agent, test adalah **cara membuktikan** bahwa perubahan benar. Agent dapat menulis kode yang terlihat
meyakinkan tetapi salah, sehingga kebutuhan testing harus tertulis jelas: test apa yang wajib, bagaimana menjalankannya,
dan apa yang tidak boleh dilakukan agar test "hijau".

Aturan siap pakai ada di [Testing & QA Rules](/agent-instructions/testing/). Halaman ini menjelaskan alasan dan cara
menyusunnya.

## Why It Matters

Masalah umum saat bekerja dengan agent:

- Agent mengklaim "semua test lulus" tanpa menjalankannya.
- Test yang gagal diubah assertion-nya agar lulus, atau di-skip.
- Hanya jalur sukses yang dites.
- Test bergantung pada waktu/jaringan sehingga flaky.

Aturan testing yang eksplisit dan verifikasi otomatis mencegah semua ini.

## Core Concepts

| Konsep | Penjelasan |
| --- | --- |
| Matriks test per perubahan | Jenis perubahan → test minimum yang wajib |
| Perintah verifikasi | Perintah persis yang harus dijalankan & dilaporkan |
| Test sebagai acceptance criteria | Kriteria penerimaan tugas ditulis sebagai skenario yang bisa dites |
| Regression test | Bug fix wajib disertai test yang gagal sebelum perbaikan |
| Larangan melemahkan | Tidak boleh menghapus/skip/melonggarkan assertion tanpa alasan tertulis |

## How It Works

```text
Task spec berisi acceptance criteria → agent menulis/menyesuaikan test → implementasi
→ menjalankan perintah DoD (format, analyze, test) → laporan berisi output perintah
→ CI menjalankan ulang secara independen → reviewer memeriksa test: apakah gagal bila logika salah?
```

## Implementation

### Matriks test (contoh di AGENTS.md)

```markdown
| Change | Required tests |
| --- | --- |
| Domain logic / use case | Unit: success + each failure/edge case |
| Cubit/Bloc/ViewModel | State transitions incl. loading → failure |
| Repository / query | Integration against a real engine (Drift in-memory, Testcontainers) |
| Endpoint | 2xx, 400/422, 401, 403, other-tenant 404, idempotent retry |
| Bug fix | Regression test that fails before the fix |
| UI critical flow | Widget test per state; E2E only for login/checkout/sync |
```

### Perintah yang persis

```markdown
## Commands (run all before reporting done)
- `dart format --output=none --set-exit-if-changed .`
- `flutter analyze --fatal-infos`
- `flutter test`
Report the summary line of each command. If a command cannot be run, say so explicitly.
```

### Larangan yang eksplisit

```markdown
- **MUST NOT** delete, skip (`skip:`, `@Ignore`, `it.skip`), or weaken assertions to make tests pass.
  If behavior intentionally changed, update the test and explain why in the report.
- **MUST NOT** add `sleep`/real delays; use fake time (`fakeAsync`, `runTest`, `vi.useFakeTimers`).
- **MUST NOT** call real network or third-party services in tests.
```

### Acceptance criteria → test

```markdown
## Acceptance criteria (task spec)
1. Kasir dapat menerapkan voucher persen; diskon tidak melebihi `maxDiscount`.
2. Voucher kedaluwarsa ditolak dengan pesan "Voucher sudah tidak berlaku".
3. Voucher yang sama tidak bisa dipakai dua kali pada satu order.
→ Minta agent membuat satu test per kriteria (nama test = kriteria), lalu implementasi.
```

### Mengecek kualitas test buatan agent

```text
□ Apakah test gagal bila logika dibuat salah? (coba ubah satu operator secara lokal / mutation testing)
□ Ada kasus gagal & tepi, bukan hanya sukses?
□ Assertion pada hasil/efek, bukan detail internal?
□ Waktu, random, ID disuntik? Tidak ada jaringan nyata?
□ Nama test menjelaskan perilaku?
```

### Test negatif keamanan

```text
Minta agent menambah test untuk: tanpa token (401), peran salah (403), objek tenant lain (404),
field terlarang (mass assignment ditolak), limit di atas maksimum, input berbahaya (string SQL/HTML)
```

## Best Practices

- **Matriks test per jenis perubahan** di AGENTS.md.
- **Perintah verifikasi persis** dan wajib dilaporkan hasilnya.
- **Acceptance criteria dalam bentuk yang bisa dites**.
- **Larangan eksplisit** untuk skip/menghapus/melemahkan test.
- **CI sebagai penentu akhir**, bukan klaim agent.
- **Review test sama ketatnya dengan review kode**.

## Anti-Patterns

- "Tolong tambahkan test" tanpa menyebut apa yang dites.
- Menerima laporan "test lulus" tanpa output atau CI.
- Snapshot/golden test untuk segala hal sehingga perubahan apa pun "diperbarui" saja.
- Coverage tinggi dari test tanpa assertion.
- Test yang memanggil API staging sungguhan.

## Performance Considerations

Suite unit yang cepat (detik) membuat agent dapat menjalankan test sering dalam satu tugas. Pisahkan test lambat
(integration/E2E) ke perintah atau job terpisah dan beri tahu agent kapan perlu menjalankannya.

## Security Considerations

Pastikan test memakai data sintetis dan tidak membutuhkan secret production. Jangan memberi agent kredensial nyata untuk
menjalankan test. Fixture tidak boleh berisi data pribadi asli.

## Real-World Use Cases

- Agent menambah fitur voucher dengan tiga test sesuai acceptance criteria. CI menolak PR karena satu kasus tepi gagal, lalu agent memperbaikinya.
- Aturan "MUST NOT weaken assertions" mencegah agent mengubah nilai yang diharapkan agar test lulus.

## Interview Questions

1. Bagaimana memastikan kode yang ditulis AI benar?
2. Apa yang Anda tulis di AGENTS.md terkait testing?
3. Bagaimana menilai kualitas test, bukan hanya jumlahnya?

## Sample Answers

1. Acceptance criteria yang bisa dites, test wajib per jenis perubahan, perintah verifikasi yang dijalankan dan dilaporkan, CI independen, serta review kode dan test oleh manusia.
2. Matriks test per jenis perubahan, perintah format/analyze/test yang persis, larangan skip atau melemahkan test, aturan determinisme (waktu, jaringan), dan test negatif keamanan untuk endpoint.
3. Periksa apakah test gagal bila logika salah (mutation testing atau mengubah kode sementara), mencakup kasus gagal dan tepi, memakai assertion pada perilaku, deterministik, dan namanya menjelaskan perilaku.

## Practical Exercises

1. Tambahkan matriks test dan perintah DoD ke AGENTS.md proyek Anda.
2. Tulis task spec dengan acceptance criteria yang dapat dites, lalu minta agent mengerjakannya test-first.
3. Jalankan mutation testing kecil pada satu modul untuk menilai kekuatan test.

## Quick Reference

```text
Matriks test per perubahan · perintah persis + laporkan output · CI = penentu akhir
Acceptance criteria → satu test per kriteria · bug fix → regression test
MUST NOT skip/hapus/lemahkan · tanpa sleep, jaringan nyata · inject clock/random/ID
Review test: gagal bila logika salah? kasus gagal & tepi? test negatif keamanan?
```

## Related Topics

- [Testing Fundamentals](/testing-performance/testing-fundamentals/)
- [AI Coding Workflow](/ai-engineering/guides/ai-coding-workflow/)
- [Test Coverage](/testing-performance/test-coverage/)
