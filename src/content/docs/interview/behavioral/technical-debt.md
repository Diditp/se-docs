---
title: "Handling Technical Debt"
description: "Menjelaskan dan menangani technical debt di interview: jenis debt, cara mengukur dan memprioritaskan, meyakinkan stakeholder, refactoring bertahap (strangler, boy scout rule), dan contoh STAR."
level: intermediate
status: complete
updated: 2026-11-12
tags: [interview, behavioral, technical-debt, refactoring, prioritization]
---

## Overview

**Technical debt** adalah biaya tambahan di masa depan akibat pilihan cepat/kurang ideal hari ini — seperti bunga utang.
Pertanyaan interview tentang debt menilai apakah Anda bisa **mengenali**, **mengukur**, **memprioritaskan**, dan
**mengomunikasikan** debt kepada pihak non-teknis, serta melunasinya tanpa menghentikan pengembangan fitur.

:::note
Contoh cerita adalah struktur; gunakan pengalaman nyata Anda.
:::

## Why It Matters

Debt yang dibiarkan memperlambat setiap fitur baru, menambah bug, dan membuat engineer frustrasi. Sebaliknya, refactor
tanpa alasan bisnis sulit disetujui. Engineer yang baik menjembatani keduanya.

## Core Concepts

| Jenis | Contoh | Catatan |
| --- | --- | --- |
| Disengaja & bijak | "Rilis dulu untuk promo, rapikan sprint depan" | Dicatat & dijadwalkan |
| Disengaja & ceroboh | "Tidak sempat menulis test" terus-menerus | Harus dihentikan |
| Tidak disengaja | Desain awal yang tidak lagi cocok setelah produk berkembang | Wajar; ditangani saat ditemukan |
| Bit rot | Dependensi usang, SDK lama, deprecated API | Dijadwalkan rutin |

**Sinyal debt**: waktu pengerjaan fitur makin lama, bug berulang di modul yang sama, takut mengubah kode tertentu,
onboarding lama, build/test lambat, peringatan deprecation menumpuk.

## How It Works

```text
Identifikasi (sinyal & data) → catat di backlog (dampak, effort, risiko)
→ prioritaskan berdasarkan dampak bisnis → pilih strategi:
   • boy scout rule (rapikan sedikit setiap menyentuh kode)
   • alokasi rutin (mis. sebagian kapasitas sprint)
   • refactor terarah sebelum fitur besar di area itu
   • strangler pattern untuk modul besar
→ ukur hasil (waktu fitur, bug, waktu build)
```

## Implementation

### Contoh jawaban (struktur)

**Pertanyaan:** "Bagaimana Anda menangani technical debt di proyek Anda?"

> **S** — Modul checkout di aplikasi kasir menumpuk logika bisnis di widget besar tanpa test; setiap perubahan promo
> memicu bug dan butuh beberapa hari untuk dites manual.
>
> **T** — Saya ingin memperbaikinya tanpa menghentikan roadmap fitur promo.
>
> **A** — Saya mengumpulkan data dari tiga bulan terakhir: jumlah bug di modul checkout dan waktu rata-rata perubahan
> promo dibanding modul lain. Data itu saya sampaikan ke PM dalam bahasa bisnis: setiap promo baru butuh waktu lebih lama
> dan berisiko salah hitung harga. Kami sepakat memakai sebagian kapasitas sprint untuk refactor bertahap. Saya mulai
> dengan menulis test karakterisasi untuk perhitungan harga, lalu memindahkan logika ke use case murni Dart satu per
> satu, dengan feature flag untuk mesin perhitungan baru.
>
> **R** — Setelah beberapa sprint, perubahan promo menjadi jauh lebih cepat dan bug perhitungan harga berkurang drastis;
> test otomatis menggantikan sebagian besar test manual.

### Item backlog debt yang baik

```markdown
**[Debt] Perhitungan harga di CheckoutPage tidak teruji**
Dampak : 4 bug harga dalam 3 bulan; perubahan promo ±3 hari
Usulan : Test karakterisasi → ekstrak PriceCalculator use case → feature flag
Effort : ±2 sprint (paralel dengan fitur)   Risiko jika dibiarkan: salah hitung harga di production
```

## Best Practices

- **Bicara dalam bahasa dampak bisnis** (waktu rilis, bug, risiko), bukan "kodenya jelek".
- **Ukur sebelum dan sesudah**.
- **Refactor bertahap & aman**: test dulu, perubahan kecil, feature flag.
- **Boy scout rule**: tinggalkan kode sedikit lebih baik dari saat ditemukan.
- **Catat debt yang disengaja** beserta rencana pelunasannya.
- **Gabungkan dengan fitur** di area yang sama untuk efisiensi.

## Anti-Patterns

- Rewrite total dari nol tanpa alasan kuat (risiko tinggi, nilai tertunda lama).
- Refactor diam-diam di PR fitur yang membuat review sulit.
- Menyebut semua kode lama sebagai debt tanpa prioritas.
- Mengeluh tentang kode lama/penulis sebelumnya di interview.

## Performance Considerations

Debt sering berwujud masalah performa (build lambat, startup lambat, query N+1). Menyebut metrik seperti waktu build CI,
cold start, atau frame jank sebelum/sesudah membuat cerita lebih kuat.

## Security Considerations

Dependensi usang dengan kerentanan yang diketahui adalah debt berprioritas tinggi. Sebutkan proses rutin seperti
`flutter pub outdated`, `npm audit`, Dependabot/Renovate, dan jadwal upgrade SDK.

## Real-World Use Cases

- Upgrade Flutter/Gradle/AGP yang tertunda beberapa versi.
- Memisahkan logika bisnis dari widget ke layer domain.
- Mengganti library yang tidak lagi di-maintain.
- Menambah test pada modul kritis sebelum menambah fitur.

## Interview Questions

1. Apa itu technical debt? Apakah selalu buruk?
2. Bagaimana meyakinkan PM untuk mengalokasikan waktu refactor?
3. Ceritakan saat Anda membayar technical debt.
4. Kapan Anda memilih rewrite dibanding refactor?
5. Bagaimana mencegah debt menumpuk?

## Sample Answers

1. Biaya masa depan akibat solusi cepat hari ini. Tidak selalu buruk — debt yang disengaja dan dicatat dapat mempercepat rilis penting; yang berbahaya adalah debt yang tidak disadari dan tidak pernah dibayar.
2. Bawa data dampak (bug, waktu pengerjaan, risiko), terjemahkan ke bahasa bisnis, usulkan rencana bertahap yang tidak menghentikan roadmap, dan ukur hasilnya.
3. STAR seperti contoh: data → kesepakatan → refactor bertahap dengan test → hasil terukur.
4. Rewrite hanya jika fondasi tidak bisa diperbaiki bertahap (teknologi tidak didukung lagi, kebutuhan berubah total) — dan sebaiknya tetap bertahap dengan strangler pattern; refactor pada umumnya lebih aman.
5. Definition of Done yang memuat test & review, linting/analisis statis di CI, catatan debt yang disengaja, alokasi rutin, dan upgrade dependensi terjadwal.

## Practical Exercises

1. Daftar 5 debt di proyek Anda; beri skor dampak & effort; urutkan.
2. Tulis satu item backlog debt dengan format di atas.
3. Latih penjelasan 30 detik tentang debt untuk PM non-teknis.

## Quick Reference

```text
Debt = bunga masa depan · sengaja (catat & jadwalkan) vs tidak sengaja
Data dampak → bahasa bisnis → bertahap (test → refactor kecil → flag) → ukur
Boy scout rule · strangler > rewrite · upgrade dependensi rutin
```

## Related Topics

- [Technical Decision Making](/interview/behavioral/technical-decision-making/)
- [Working Under Pressure](/interview/behavioral/working-under-pressure/)
- [Clean Architecture Questions](/interview/technical/clean-architecture/)
