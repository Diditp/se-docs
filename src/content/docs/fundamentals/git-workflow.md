---
title: "Git & Git Workflow"
description: "Model data Git, perintah harian, branching strategy (GitHub Flow, trunk-based, Git Flow), Conventional Commits, dan cara pulih dari kesalahan."
level: beginner
status: complete
version: "Git 2.40+"
updated: 2026-11-07
tags: [git, workflow, branching, version-control]
---

## Overview

**Git** adalah distributed version control system: setiap clone memiliki seluruh histori. **Git workflow** adalah
kesepakatan tim tentang *bagaimana* branch dibuat, direview, digabung, dan dirilis.

## Why It Matters

Git adalah alat kolaborasi harian. Workflow yang buruk menghasilkan merge conflict besar, rilis yang tidak bisa
ditelusuri, dan hotfix yang menimpa pekerjaan orang lain. Di interview, Git sering dipakai untuk menguji pemahaman
kolaborasi dan kemampuan memulihkan masalah (*"Bagaimana membatalkan commit yang sudah dipush?"*).

## Core Concepts

- **Commit** — snapshot seluruh project + metadata + pointer ke parent; diidentifikasi hash SHA.
- **Branch** — pointer ringan yang bergerak ke commit terbaru. **HEAD** — pointer ke branch/commit yang sedang aktif.
- **Tiga area:** working directory → staging area (index) → repository.
- **Remote** (`origin`) — salinan repository di server; `fetch` mengambil, `pull` = fetch + merge/rebase, `push` mengirim.
- **Merge** (menggabungkan histori, bisa membuat merge commit) vs **rebase** (memindahkan commit ke base baru, menulis ulang histori).
- **Tag** — penanda permanen, biasanya untuk versi rilis (`v1.4.0`).

## How It Works

```text
           feature/checkout:      C---D---E
                                 /
main:                  A---B---F---G
                                      \
git merge feature    → A---B---F---G---M        (M = merge commit, histori bercabang tetap ada)
git rebase main      → A---B---F---G---C'--D'--E'  (commit baru dengan hash baru, linear)
squash merge (PR)    → A---B---F---G---S        (S berisi gabungan C+D+E)
```

Git menyimpan objek **blob** (isi file), **tree** (direktori), dan **commit** (tree + parent + metadata) yang dialamatkan
dengan hash. Karena commit mereferensikan parent, mengubah satu commit lama mengubah hash semua commit sesudahnya —
itulah mengapa rebase "menulis ulang histori".

## Implementation

### Alur harian (GitHub Flow / trunk-based dengan short-lived branch)

```bash
git switch main && git pull --rebase            # mulai dari main terbaru
git switch -c feat/pos-split-payment            # branch pendek, satu tujuan

# ... coding ...
git add -p                                      # stage per potongan, review diri sendiri
git commit -m "feat(checkout): support split payment cash + qris"

git fetch origin
git rebase origin/main                          # rapikan sebelum PR (branch pribadi → aman)
git push -u origin feat/pos-split-payment       # buka Pull Request → CI → review → squash merge
```

### Conventional Commits

```text
<type>(<scope>): <deskripsi imperatif singkat>

[body: alasan perubahan, bukan apa yang diubah]

[footer: BREAKING CHANGE: ..., Refs: #123]
```

Type umum: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`. Manfaat: changelog & semantic
versioning otomatis (`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major).

### Pulih dari kesalahan

| Situasi | Perintah |
| --- | --- |
| Batalkan perubahan file belum di-stage | `git restore path/file` |
| Keluarkan file dari staging | `git restore --staged path/file` |
| Perbaiki pesan/isi commit terakhir (belum dipush) | `git commit --amend` |
| Batalkan commit yang **sudah dipush** ke branch bersama | `git revert <sha>` |
| Buang commit lokal terakhir (belum dipush) | `git reset --hard HEAD~1` |
| "Hilang" setelah reset/rebase | `git reflog` → `git reset --hard <sha>` |
| Simpan pekerjaan sementara | `git stash push -m "wip"` → `git stash pop` |
| Ambil satu commit dari branch lain (hotfix) | `git cherry-pick <sha>` |
| Cari commit yang memperkenalkan bug | `git bisect start` → `good`/`bad` |
| Push setelah rebase branch pribadi | `git push --force-with-lease` (bukan `--force`) |

### Menyelesaikan merge conflict

```bash
git rebase origin/main
# CONFLICT in lib/features/cart/cart_bloc.dart
# edit file: pilih/gabungkan bagian <<<<<<< ======= >>>>>>>, jalankan test
git add lib/features/cart/cart_bloc.dart
git rebase --continue          # atau --abort untuk kembali ke kondisi awal
```

## Best Practices

- **Branch pendek (≤ 1–3 hari) dan PR kecil (< ~400 baris)** — review lebih teliti, konflik lebih kecil.
- **Commit atomik**: satu commit, satu perubahan logis, build tetap hijau. Memudahkan `revert` & `bisect`.
- **Jangan rebase/force-push branch bersama** (`main`, `develop`, branch yang dipakai orang lain).
- **`--force-with-lease`** untuk branch pribadi: gagal jika ada commit orang lain yang belum Anda lihat.
- **Proteksi `main`**: wajib PR, review, dan CI hijau; larang force push.
- **Feature flag** untuk fitur yang belum selesai — memungkinkan merge sering tanpa merilis fitur setengah jadi.
- **`.gitignore` sejak awal**: `build/`, `.dart_tool/`, `node_modules/`, `.env`, `*.jks`, `key.properties`, `google-services.json` (sesuai kebijakan tim).

### Memilih branching strategy

| Strategi | Cocok untuk | Catatan |
| --- | --- | --- |
| **GitHub Flow** | Web/backend dengan continuous deployment | `main` selalu deployable; feature branch → PR → merge → deploy |
| **Trunk-based** | Tim matang dengan CI kuat | Commit ke trunk sangat sering, feature flag wajib |
| **Git Flow** | Rilis terjadwal/berversi (mobile app store, on-premise) | `develop`, `release/*`, `hotfix/*`; lebih berat |

Untuk aplikasi mobile, varian umum: GitHub Flow + **release branch** (`release/1.8`) saat submit ke store, dengan hotfix
di-cherry-pick ke release branch dan ke `main`.

## Anti-Patterns

- Commit `"fix"`, `"update"`, `"wip"` ke `main`.
- Long-lived feature branch berminggu-minggu → *merge hell*.
- Commit secret (`.env`, keystore) — menghapus di commit berikutnya **tidak** menghapus dari histori.
- `git push --force` ke `main`.
- Satu PR berisi refactor besar + fitur + format ulang seluruh file.

## Performance Considerations

- Repository besar: gunakan **shallow clone** di CI (`fetch-depth: 1`), **Git LFS** untuk aset biner besar, dan `git sparse-checkout` untuk monorepo.
- Hindari commit file build/generated besar — memperbesar histori secara permanen.

## Security Considerations

- **Jika secret ter-commit: anggap bocor → rotate secret segera**, baru bersihkan histori (`git filter-repo`) bila perlu.
- Aktifkan **secret scanning** dan push protection (GitHub), serta pre-commit hook (gitleaks).
- **Signed commits** (GPG/SSH) dan branch protection untuk mencegah commit palsu.
- Review dependency changes (`pubspec.lock`, `package-lock.json`) di PR.

## Real-World Use Cases

- **Hotfix produksi aplikasi mobile:** buat `hotfix/1.8.1` dari tag `v1.8.0`, perbaiki, tag `v1.8.1`, rilis, lalu merge/cherry-pick ke `main`.
- **Mencari regresi:** `git bisect` di antara rilis terakhir yang baik dan build yang rusak.
- **Release notes otomatis** dari Conventional Commits (release-please / semantic-release).

## Interview Questions

1. **(Fundamental)** Apa beda `git fetch` dan `git pull`?
2. **(Fundamental)** Apa beda merge dan rebase?
3. **(Intermediate)** Bagaimana membatalkan commit yang sudah dipush ke `main`?
4. **(Intermediate)** Branching strategy apa yang Anda pakai dan mengapa?
5. **(Intermediate)** Bagaimana menangani merge conflict?
6. **(Advanced)** Secret API ter-commit dan sudah dipush. Apa langkah Anda?

## Sample Answers

1. `fetch` mengunduh commit dan memperbarui remote-tracking branch (`origin/main`) tanpa menyentuh branch lokal. `pull` = `fetch` + integrasi (merge atau rebase) ke branch saat ini.
2. Merge menggabungkan dua histori dan mempertahankan histori asli (bisa ada merge commit). Rebase memindahkan commit ke atas base baru sehingga histori linear, tetapi membuat commit baru (hash berubah) — aman hanya untuk branch yang belum dipakai orang lain.
3. `git revert <sha>` lalu push — membuat commit pembalik tanpa menulis ulang histori bersama. Untuk aplikasi yang sudah dirilis, perbaikan dirilis sebagai versi baru.
4. GitHub Flow dengan short-lived branch, PR wajib review + CI, squash merge, dan release branch untuk versi app store. Alasannya: integrasi sering, konflik kecil, histori `main` rapi, dan tetap bisa hotfix versi yang sudah dirilis.
5. Pahami kedua sisi perubahan (baca PR terkait), gabungkan secara manual, jalankan build & test, lalu lanjutkan merge/rebase. Konflik berulang adalah sinyal branch terlalu lama hidup.
6. Rotate/revoke secret sekarang juga (itu yang paling penting), periksa log penyalahgunaan, hapus dari kode dan pindahkan ke secret manager/CI secrets, bersihkan histori bila perlu (`git filter-repo` + koordinasi force-push), tambahkan secret scanning & pre-commit hook.

## Practical Exercises

1. Buat repo latihan, buat konflik sengaja di dua branch, selesaikan dengan merge lalu ulangi dengan rebase.
2. Lakukan `git reset --hard HEAD~3` lalu pulihkan dengan `git reflog`.
3. Gunakan `git bisect run <test-script>` untuk menemukan commit yang merusak test.
4. Pasang commitlint + husky (atau lefthook) untuk memvalidasi Conventional Commits.

## Quick Reference

```bash
git switch -c feat/x          # branch baru
git add -p && git commit       # stage interaktif
git rebase origin/main         # update branch pribadi
git push --force-with-lease    # push setelah rebase (branch pribadi)
git revert <sha>               # batalkan commit yang sudah publik
git reflog                     # jaring pengaman
git stash / git cherry-pick / git bisect
```

## Related Topics

- [Agile, Scrum & Code Review](/fundamentals/agile-scrum-code-review/)
- [GitHub Actions](/devops/github-actions/)
- [Versioning & Release Management](/devops/versioning-release/)
- [Git Commit, PR & Code Review Checklist (AI)](/ai-engineering/guides/git-commit-pr/)
- Referensi resmi: [Pro Git Book](https://git-scm.com/book), [Conventional Commits](https://www.conventionalcommits.org).
