---
title: "Design a Ticketing Application"
description: "Latihan system design interview: aplikasi tiket keluhan/gangguan pelanggan dengan teknisi lapangan — requirement, state machine tiket, SLA & eskalasi, assignment, aplikasi teknisi offline, lampiran foto, notifikasi, audit, dan trade-off."
level: advanced
status: complete
updated: 2026-11-12
tags: [interview, system-design, ticketing, sla, state-machine, field-service]
---

## Overview

Soal: **"Rancang aplikasi tiket untuk keluhan pelanggan yang ditangani oleh customer service dan teknisi lapangan."**
Ini bukan soal skala ekstrem, melainkan **pemodelan proses bisnis**: siklus hidup tiket (state machine), SLA dan
eskalasi, penugasan teknisi, dan aplikasi mobile teknisi yang bekerja di area sinyal lemah.

:::note
Soal "ticketing" kadang berarti **penjualan tiket acara** (fokus: concurrency kursi & lonjakan trafik). Klarifikasi di
awal. Bagian akhir halaman ini merangkum perbedaan desainnya.
:::

## Why It Matters

Banyak perusahaan layanan (telekomunikasi, utilitas, internet) bergantung pada sistem tiket untuk menangani gangguan.
Interviewer menilai kemampuan menerjemahkan proses bisnis menjadi data model, API, dan aturan yang dapat diaudit.

## Core Concepts

### Requirement

| Fungsional | Non-fungsional |
| --- | --- |
| Pelanggan membuat tiket (app/web/call center) | Riwayat lengkap & dapat diaudit |
| CS melakukan triage, kategori, prioritas | SLA dihitung akurat |
| Penugasan ke teknisi berdasarkan area/skill/beban | Aplikasi teknisi bisa offline |
| Teknisi update status, foto, tanda tangan | Notifikasi tepat waktu |
| SLA & eskalasi otomatis | Laporan kinerja (MTTR, pencapaian SLA) |

### State machine tiket

```text
NEW → TRIAGED → ASSIGNED → ON_THE_WAY → IN_PROGRESS → RESOLVED → CLOSED
                   │                         │             │
                   └──── ON_HOLD (menunggu pelanggan/material) ──┘
RESOLVED → REOPENED (pelanggan tidak puas, dalam N hari) → ASSIGNED
Semua state aktif → CANCELLED (dengan alasan)
```

Transisi divalidasi di server: hanya transisi yang diizinkan, oleh peran yang berwenang.

## How It Works

```text
Pelanggan (app/web) ─┐
Call center (CS web) ─┼──► Ticket API ──► PostgreSQL (tickets, ticket_events, assignments, sla)
Monitoring jaringan ──┘        │                │
  (tiket otomatis)              │                └─► Object storage (foto, dokumen)
                               ├─► Queue: TicketCreated / StatusChanged / SlaBreached
                               │        ├─► Notification worker (push/SMS/email)
                               │        ├─► Assignment worker (rekomendasi teknisi)
                               │        └─► Reporting (read model / data warehouse)
                               └─► SLA scheduler (cek tenggat, eskalasi)
Aplikasi teknisi (Flutter, offline-first) ⇄ Sync API
```

## Implementation

### Data model

```sql
CREATE TABLE tickets (
  id uuid PRIMARY KEY,
  number text UNIQUE NOT NULL,              -- TKT-2026-000123
  customer_id bigint NOT NULL,
  category text NOT NULL, priority text NOT NULL,   -- P1..P4
  status text NOT NULL,
  area_code text NOT NULL,
  assigned_to bigint,
  sla_response_due timestamptz, sla_resolve_due timestamptz,
  version int NOT NULL DEFAULT 1,           -- optimistic locking
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ticket_events (                -- audit trail append-only
  id bigserial PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES tickets(id),
  type text NOT NULL, from_status text, to_status text,
  actor_id bigint NOT NULL, note text, payload jsonb,
  client_event_id uuid UNIQUE,              -- idempotency dari aplikasi teknisi
  occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tickets (status, area_code, priority);
CREATE INDEX ON tickets (assigned_to, status);
```

### Update status dengan validasi transisi & optimistic locking

```ts
const allowed: Record<string, string[]> = {
  ASSIGNED: ['ON_THE_WAY', 'ON_HOLD', 'CANCELLED'],
  ON_THE_WAY: ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['RESOLVED', 'ON_HOLD'],
  RESOLVED: ['CLOSED', 'REOPENED'],
};

async function changeStatus(cmd: { ticketId: string; to: string; version: number; actor: User; clientEventId: string }) {
  return db.tx(async (tx) => {
    const t = await tx.ticket.get(cmd.ticketId);
    if (!allowed[t.status]?.includes(cmd.to)) throw new DomainError('INVALID_TRANSITION');
    if (!canTransition(cmd.actor, t, cmd.to)) throw new ForbiddenError();
    const updated = await tx.ticket.updateWhere({ id: t.id, version: cmd.version }, { status: cmd.to, version: t.version + 1 });
    if (updated === 0) throw new ConflictError('TICKET_MODIFIED');          // 409 → client muat ulang
    await tx.ticketEvent.insert({ ticketId: t.id, type: 'STATUS_CHANGED', from: t.status, to: cmd.to,
                                  actorId: cmd.actor.id, clientEventId: cmd.clientEventId });
    await tx.outbox.insert({ type: 'TicketStatusChanged', ticketId: t.id, to: cmd.to });
  });
}
```

### SLA & eskalasi

| Prioritas | Respons | Penyelesaian | Eskalasi |
| --- | --- | --- | --- |
| P1 (layanan mati, banyak pelanggan) | 15 menit | 4 jam | Supervisor → manajer area |
| P2 | 1 jam | 8 jam | Supervisor |
| P4 (permintaan informasi) | 1 hari kerja | 3 hari kerja | – |

*(Angka contoh — SLA nyata ditentukan kontrak/kebijakan perusahaan.)* SLA scheduler memeriksa tiket mendekati tenggat
(mis. setiap menit, query berindex `sla_resolve_due`) dan memancarkan event peringatan/eskalasi; waktu `ON_HOLD`
karena menunggu pelanggan dapat menghentikan jam SLA sesuai kebijakan.

### Aplikasi teknisi (offline)

- Daftar tugas & detail tiket di-cache di database lokal.
- Update status, catatan, foto disimpan lokal + outbox dengan `client_event_id`; `occurred_at` dari perangkat, `recorded_at` dari server.
- Foto dikompres dan diunggah terpisah (resumable/presigned URL), dihubungkan ke event setelah upload selesai.
- Konflik (tiket dialihkan ke teknisi lain saat offline) → server menolak dengan alasan jelas, aplikasi menampilkan pesan.

## Best Practices

- **State machine eksplisit** di server; UI hanya menampilkan aksi yang valid.
- **Event log append-only** untuk audit dan laporan SLA.
- **Optimistic locking** untuk mencegah update yang saling menimpa.
- **Outbox pattern** agar event & notifikasi konsisten dengan perubahan data.
- **Pisahkan read model** untuk dashboard & laporan.

## Anti-Patterns

- Status sebagai string bebas yang bisa di-set ke nilai apa pun oleh klien.
- Mengubah/menghapus riwayat tiket.
- Menghitung SLA dari waktu server saat sinkron (bukan waktu kejadian) tanpa kebijakan yang jelas.
- Mengunggah foto resolusi penuh di jaringan seluler lemah dalam request yang sama dengan update status.

## Performance Considerations

- Index untuk antrean kerja (status, area, prioritas) dan daftar tugas teknisi.
- Dashboard real-time memakai read model/cache, bukan query agregat berat setiap refresh.
- Partisi `ticket_events` per waktu; arsipkan tiket lama.

## Security Considerations

- RBAC & scope per area: teknisi hanya melihat tiket yang ditugaskan; CS sesuai wilayah.
- Data pribadi pelanggan (alamat, telepon) dimasking sesuai kebutuhan; lindungi lampiran dengan URL bertanda tangan berumur pendek.
- Audit log siapa melihat/mengubah data sensitif.
- Validasi lokasi/foto untuk mencegah laporan palsu bila dibutuhkan (dengan memperhatikan privasi).

## Real-World Use Cases

- Tiket gangguan layanan internet/listrik/telekomunikasi.
- Helpdesk IT internal.
- Work order pemeliharaan aset.

### Bila yang dimaksud penjualan tiket acara

| Aspek | Fokus desain |
| --- | --- |
| Concurrency kursi | Hold kursi dengan TTL (Redis/DB conditional update), konfirmasi setelah bayar |
| Lonjakan trafik | Virtual waiting room/queue, CDN, rate limit, autoscale |
| Pembayaran | Idempotency, timeout hold, rekonsiliasi pembayaran |
| Anti-bot | CAPTCHA, batas per akun |

## Interview Questions

1. Bagaimana memodelkan siklus hidup tiket?
2. Bagaimana menghitung dan menegakkan SLA?
3. Bagaimana mencegah dua orang mengubah tiket yang sama secara bersamaan?
4. Bagaimana aplikasi teknisi bekerja di area tanpa sinyal?
5. Bagaimana menugaskan tiket ke teknisi yang tepat?

## Sample Answers

1. State machine dengan transisi yang diizinkan per peran, divalidasi di server, dan setiap transisi dicatat di event log append-only.
2. Tenggat dihitung saat tiket dibuat/diubah prioritas berdasarkan kebijakan (jam kerja, pause saat ON_HOLD); scheduler memeriksa tenggat dan memicu peringatan/eskalasi; laporan pencapaian dari event log.
3. Optimistic locking dengan kolom `version`: update hanya berhasil jika versi sama; jika tidak, kembalikan 409 dan klien memuat data terbaru.
4. Offline-first: cache tugas di database lokal, perubahan ke outbox dengan ID idempoten, foto diunggah terpisah dan dapat dilanjutkan, sinkron otomatis saat online, konflik ditangani dengan aturan server.
5. Mulai dengan aturan sederhana (area, skill, beban kerja aktif, ketersediaan), sistem merekomendasikan dan supervisor dapat override; kemudian pertimbangkan jarak/rute dan prioritas.

## Practical Exercises

1. Gambar state machine lengkap beserta peran yang boleh melakukan setiap transisi.
2. Tulis query pencapaian SLA bulanan per area.
3. Rancang fitur "tiket massal" ketika satu gangguan jaringan berdampak pada ribuan pelanggan (parent–child ticket).

## Quick Reference

```text
State machine (server) + event log append-only + optimistic locking (version) + outbox
SLA: due time saat create · scheduler · eskalasi · pause saat ON_HOLD (sesuai kebijakan)
Teknisi: offline-first · client_event_id · occurred_at vs recorded_at · foto upload terpisah
Klarifikasi: tiket gangguan vs tiket acara (concurrency kursi & waiting room)
```

## Related Topics

- [Ticketing System (case study)](/system-design/case-studies/ticketing-system/)
- [Design a Notification System](/interview/system-design/notification-system/)
- [Design a Telecom Service Management Platform](/interview/system-design/telecom-platform/)
- [Design an Offline-First POS Application](/interview/system-design/offline-first-pos/)
