---
title: "Software Engineering Fundamentals"
description: "Ringkasan fondasi software engineering untuk interview di perusahaan mana pun: SDLC & model proses, requirement, OOP & 4 pilar, SOLID, design pattern umum, UML dasar, testing, version control, dan Agile/Scrum."
level: beginner
status: complete
updated: 2026-11-13
tags: [interview, company-prep, sdlc, oop, solid, uml, agile]
---

## Overview

Tes kompetensi teknis dan interview untuk posisi IT sering menguji **fondasi rekayasa perangkat lunak** di luar framework:
siklus hidup pengembangan (SDLC), model proses (Waterfall, Agile), requirement, OOP, prinsip desain, diagram UML, testing,
dan version control. Halaman ini merangkum yang perlu dikuasai beserta tautan ke materi lengkap.

## Why It Matters

Fondasi ini menunjukkan bahwa Anda memahami **cara membangun software secara terencana**, bukan hanya menulis kode.
Pertanyaan seperti "jelaskan 4 pilar OOP", "beda Waterfall dan Agile", atau "apa itu use case diagram" adalah penyaring awal yang umum.

## Core Concepts

### SDLC & model proses

| Tahap SDLC | Output utama |
| --- | --- |
| Planning | Tujuan, ruang lingkup, estimasi, studi kelayakan |
| Requirement analysis | Dokumen kebutuhan (SRS), user story, acceptance criteria |
| Design | Arsitektur, desain database, UI/UX, kontrak API |
| Implementation | Kode, code review |
| Testing | Unit/integration/system/UAT |
| Deployment | Rilis ke production |
| Maintenance | Bug fix, perbaikan, monitoring |

| Model | Ciri | Cocok untuk |
| --- | --- | --- |
| Waterfall | Berurutan, dokumentasi lengkap di awal | Requirement stabil, regulasi ketat |
| V-Model | Setiap tahap desain berpasangan dengan tahap testing | Sistem kritis yang perlu verifikasi ketat |
| Iterative/Incremental | Dibangun bertahap | Produk besar yang bisa dirilis per bagian |
| Agile (Scrum/Kanban) | Iterasi pendek, feedback cepat, perubahan diterima | Requirement berkembang, produk digital |

### Requirement

- **Functional**: apa yang dilakukan sistem ("pelanggan dapat melaporkan gangguan").
- **Non-functional**: kualitas sistem (performa, keamanan, ketersediaan, usability) — harus terukur.
- **User story**: *Sebagai <peran>, saya ingin <tujuan> agar <manfaat>* + acceptance criteria.

### OOP — 4 pilar

| Pilar | Arti | Contoh |
| --- | --- | --- |
| Encapsulation | Menyembunyikan state internal, akses lewat method | `balance` private, ubah via `deposit()` |
| Abstraction | Menampilkan hal penting, menyembunyikan detail | `PaymentGateway.charge()` |
| Inheritance | Class turunan mewarisi class induk | `QrisPayment extends Payment` |
| Polymorphism | Satu antarmuka, banyak implementasi | `payment.process()` berperilaku sesuai jenis |

Plus prinsip **SOLID** ([materi lengkap](/fundamentals/solid-principles/)) dan **composition over inheritance**.

### Design pattern yang sering ditanya

| Kategori | Pattern | Contoh di app |
| --- | --- | --- |
| Creational | Singleton, Factory, Builder | Satu instance HTTP client; `fromJson` factory |
| Structural | Adapter, Facade, Decorator | Mapper DTO→entity; facade `PaymentService` |
| Behavioral | Observer, Strategy, Command, State | Stream/Bloc; metode pembayaran; undo |
| Arsitektural | MVC, MVVM, Clean Architecture, Repository | Struktur app Flutter/Android |

### UML dasar

| Diagram | Menggambarkan |
| --- | --- |
| Use case | Aktor & fungsi sistem |
| Class | Class, atribut, method, relasi (asosiasi, agregasi, komposisi, inheritance) |
| Sequence | Interaksi antar objek berurutan waktu |
| Activity | Alur proses/workflow |
| ERD (bukan UML, sering ditanya) | Entitas & relasi database |

### Testing level

Unit → Integration → System → User Acceptance Test (UAT). Black-box (berdasarkan spesifikasi) vs white-box (berdasarkan kode).

## How It Works

Contoh alur Scrum dua minggu:

```text
Product Backlog → Sprint Planning (pilih item, definisikan Sprint Goal) → Sprint (2 minggu)
  Daily Scrum (15 menit) · pengembangan · code review · testing
→ Sprint Review (demo ke stakeholder) → Sprint Retrospective (perbaikan proses) → sprint berikutnya
Peran: Product Owner (prioritas) · Scrum Master (fasilitator) · Developers (membangun)
```

## Implementation

### Sequence diagram teks: lapor gangguan

```text
Pelanggan → App: isi form gangguan
App → API: POST /v1/tickets
API → DB: INSERT ticket (status OPEN)
API → Queue: publish TicketCreated
API → App: 201 Created (nomor tiket)
Queue → Dispatcher Service: assign teknisi
Dispatcher Service → App Teknisi: push notification "Tugas baru"
```

### Contoh polymorphism + strategy (Dart)

```dart
abstract interface class PaymentMethod { Future<PaymentResult> pay(int amount); }
class Cash implements PaymentMethod { @override Future<PaymentResult> pay(int a) async => PaymentSuccess('CASH-$a'); }
class Qris implements PaymentMethod {
  Qris(this._api);
  final PaymentApi _api;
  @override Future<PaymentResult> pay(int a) => _api.createQris(a);
}
Future<PaymentResult> checkout(PaymentMethod method, int total) => method.pay(total);   // satu antarmuka, banyak implementasi
```

### User story dengan acceptance criteria (Given–When–Then)

```text
Sebagai pelanggan, saya ingin melihat status tiket gangguan agar tahu kapan layanan pulih.
- Given saya memiliki tiket aktif, When membuka menu Tiket, Then saya melihat status & estimasi terbaru.
- Given status tiket berubah, When saya tidak membuka aplikasi, Then saya menerima notifikasi.
- Given saya tidak memiliki tiket, Then tampil pesan "Belum ada laporan" dan tombol "Laporkan gangguan".
```

## Best Practices

- **Requirement yang jelas & terukur** sebelum desain; NFR ditulis dengan angka.
- **Desain sebelum kode** untuk fitur besar (diagram sederhana + kontrak API).
- **Version control & code review** untuk setiap perubahan ([Git](/fundamentals/git-workflow/)).
- **Testing di beberapa level**, otomatis di CI.
- **Dokumentasi secukupnya**: README, ADR, diagram yang terawat.
- **Iterasi pendek dengan feedback user**.

## Anti-Patterns

- Mulai coding tanpa memahami requirement.
- Inheritance berlapis untuk reuse kode → struktur rapuh.
- God class yang mengerjakan semuanya.
- Testing hanya di akhir proyek.
- Agile dijadikan alasan untuk tidak merencanakan atau tidak mendokumentasikan apa pun.

## Performance Considerations

Fondasi ini memengaruhi performa secara tidak langsung: NFR performa yang ditulis sejak awal, desain data yang benar,
dan pengujian beban sebelum rilis mencegah masalah performa yang mahal diperbaiki belakangan.

## Security Considerations

**Secure SDLC**: kebutuhan keamanan di tahap requirement, threat modeling di tahap desain, secure coding & code review,
security testing (SAST/DAST/pentest), dan patch di tahap maintenance.

## Real-World Use Cases

- Proyek sistem internal dengan requirement regulasi → Waterfall/V-Model dengan dokumentasi lengkap.
- Aplikasi pelanggan yang terus berkembang → Scrum dua mingguan dengan rilis bertahap.
- Integrasi pembayaran → Strategy pattern untuk banyak metode, Adapter untuk API vendor.

## Interview Questions

1. Jelaskan tahapan SDLC.
2. Apa beda Waterfall dan Agile? Kapan memakai masing-masing?
3. Jelaskan 4 pilar OOP dengan contoh.
4. Apa beda functional dan non-functional requirement?
5. Sebutkan design pattern yang pernah Anda pakai dan alasannya.
6. Apa itu use case diagram dan sequence diagram?
7. Apa beda black-box dan white-box testing?

## Sample Answers

1. Planning, requirement analysis, design, implementation, testing, deployment, maintenance — dengan output tiap tahap seperti dokumen kebutuhan, desain arsitektur, kode, hasil uji, rilis, dan perbaikan berkelanjutan.
2. Waterfall berurutan dan cocok untuk requirement stabil serta kebutuhan dokumentasi/regulasi ketat; Agile iteratif dengan feedback cepat dan cocok untuk produk yang requirement-nya berkembang. Banyak organisasi memakai pendekatan hybrid.
3. Encapsulation (menyembunyikan state, akses via method), abstraction (fokus pada apa, bukan bagaimana), inheritance (mewarisi perilaku), polymorphism (satu antarmuka, banyak implementasi) — contoh metode pembayaran tunai/QRIS dengan antarmuka `pay()` yang sama.
4. Functional: fitur/perilaku sistem. Non-functional: kualitas seperti performa, keamanan, ketersediaan, skalabilitas, usability — harus terukur (mis. p95 < 300 ms).
5. Repository untuk memisahkan sumber data, Strategy untuk metode pembayaran, Observer melalui Stream/Bloc, Factory untuk parsing JSON, Singleton/DI untuk HTTP client — masing-masing dengan alasannya.
6. Use case diagram menunjukkan aktor dan fungsi yang bisa dilakukan terhadap sistem; sequence diagram menunjukkan urutan pesan antar objek/komponen untuk satu skenario.
7. Black-box menguji berdasarkan spesifikasi tanpa melihat kode (input → output); white-box menguji berdasarkan struktur internal kode (cabang, path).

## Practical Exercises

1. Tulis 3 user story + acceptance criteria untuk fitur "pembayaran tagihan".
2. Gambar use case, class, dan sequence diagram untuk fitur tersebut.
3. Jelaskan 4 pilar OOP dengan kode dari project Anda sendiri.

## Quick Reference

```text
SDLC: Plan → Requirement → Design → Implement → Test → Deploy → Maintain
Waterfall (stabil, dokumentasi) · V-Model (verifikasi ketat) · Agile/Scrum (iteratif, feedback)
OOP: Encapsulation · Abstraction · Inheritance · Polymorphism + SOLID + composition > inheritance
Pattern: Singleton/Factory · Adapter/Facade · Observer/Strategy · Repository/MVVM/Clean
UML: use case · class · sequence · activity (+ ERD) · Test: unit → integration → system → UAT
```

## Related Topics

- [SDLC](/fundamentals/sdlc/) · [OOP](/fundamentals/oop/) · [SOLID](/fundamentals/solid-principles/)
- [Design Patterns](/fundamentals/design-patterns/) · [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
- [OOP, SOLID & Design Patterns — Questions](/interview/technical/oop-solid-patterns/)
