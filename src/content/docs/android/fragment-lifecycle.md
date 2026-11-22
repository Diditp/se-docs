---
title: "Fragment Lifecycle"
description: "Siklus hidup Fragment dan view-nya: callback onCreate hingga onDestroy, perbedaan lifecycle Fragment vs viewLifecycleOwner, back stack & FragmentManager, komunikasi antar fragment (shared ViewModel, Fragment Result API), memory leak ViewBinding, dan posisinya di era Compose."
level: intermediate
status: complete
version: "AndroidX Fragment 1.6+"
updated: 2026-11-13
tags: [android, fragment, lifecycle, viewbinding]
---

## Overview

**Fragment** adalah bagian UI yang dapat digunakan ulang di dalam Activity, dengan lifecycle sendiri. Yang sering
membingungkan: Fragment punya **dua lifecycle** — lifecycle **Fragment** itu sendiri dan lifecycle **view**-nya
(`viewLifecycleOwner`), karena view dapat dihancurkan dan dibuat ulang saat Fragment masih hidup (mis. masuk back stack).

:::note
Aplikasi baru banyak memakai Jetpack Compose + Navigation Compose tanpa Fragment. Namun banyak aplikasi production
(dan pertanyaan interview) masih memakai Fragment, sehingga pemahaman ini tetap penting.
:::

## Why It Matters

Bug Fragment klasik — crash `IllegalStateException`, observer terdaftar ganda, memory leak binding — hampir semuanya
berasal dari mencampur dua lifecycle tersebut.

## Core Concepts

| Callback | Kapan | Gunakan untuk |
| --- | --- | --- |
| `onAttach` | Fragment terhubung ke host | Jarang; ambil context bila perlu |
| `onCreate` | Fragment dibuat | Inisialisasi non-view, baca arguments |
| `onCreateView` | View dibuat | Inflate layout / ViewBinding |
| `onViewCreated` | View siap | Setup listener, observe dengan `viewLifecycleOwner` |
| `onStart` / `onResume` | Terlihat / interaktif | Mulai hal yang butuh terlihat |
| `onPause` / `onStop` | Kehilangan fokus / tidak terlihat | Hentikan kerja UI |
| `onDestroyView` | View dihancurkan (fragment bisa tetap hidup di back stack) | **Lepas referensi binding/view** |
| `onDestroy` | Fragment dihancurkan | Bersihkan sisanya |
| `onDetach` | Lepas dari host | — |

Konsep lain: **FragmentManager** (mengelola transaksi & back stack), `add`/`replace`, `addToBackStack`,
`childFragmentManager` (fragment bersarang), **arguments** `Bundle` untuk input, **Fragment Result API** untuk
mengembalikan hasil.

## How It Works

```text
Navigasi A → B (replace + addToBackStack):
  A: onPause → onStop → onDestroyView        (A masih hidup, view-nya hancur)
  B: onAttach → onCreate → onCreateView → onViewCreated → onStart → onResume
Tombol back:
  B: ... → onDestroyView → onDestroy → onDetach
  A: onCreateView → onViewCreated → onStart → onResume   (view A dibuat ulang)
```

## Implementation

### ViewBinding tanpa leak

```kotlin
class OrdersFragment : Fragment(R.layout.fragment_orders) {
    private var _binding: FragmentOrdersBinding? = null
    private val binding get() = _binding!!                  // hanya valid antara onViewCreated & onDestroyView
    private val viewModel: OrdersViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        _binding = FragmentOrdersBinding.bind(view)
        binding.refresh.setOnClickListener { viewModel.refresh() }

        viewLifecycleOwner.lifecycleScope.launch {           // terikat lifecycle VIEW, bukan fragment
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { render(it) }
            }
        }
    }

    override fun onDestroyView() {
        _binding = null                                      // cegah leak view saat fragment di back stack
        super.onDestroyView()
    }
}
```

### Arguments & factory

```kotlin
companion object {
    private const val ARG_ORDER_ID = "order_id"
    fun newInstance(orderId: String) = OrderDetailFragment().apply {
        arguments = bundleOf(ARG_ORDER_ID to orderId)        // bertahan saat recreate; jangan pakai constructor ber-parameter
    }
}
```

### Komunikasi antar fragment

```kotlin
// 1. Shared ViewModel (scope Activity atau nav graph)
private val cartViewModel: CartViewModel by activityViewModels()

// 2. Fragment Result API
// Penerima
setFragmentResultListener("pick_customer") { _, bundle ->
    viewModel.onCustomerPicked(bundle.getString("customer_id"))
}
// Pengirim
setFragmentResult("pick_customer", bundleOf("customer_id" to id))
parentFragmentManager.popBackStack()
```

## Best Practices

- **Observe dengan `viewLifecycleOwner`** di `onViewCreated`, bukan `this`.
- **Null-kan binding di `onDestroyView`**.
- **Gunakan `newInstance` + arguments**; Fragment harus punya constructor kosong (sistem membuat ulang lewat refleksi).
- **Komunikasi lewat shared ViewModel/Fragment Result API**, bukan memanggil method fragment lain langsung.
- **Navigation Component** untuk mengelola transaksi dan back stack.

## Anti-Patterns

- `viewModel.state.observe(this) {...}` di fragment → observer ganda setelah kembali dari back stack.
- Menyimpan binding/view sebagai `lateinit` tanpa dibersihkan.
- Constructor dengan parameter (crash/kehilangan data saat recreate).
- `commit()` setelah `onSaveInstanceState` (IllegalStateException) — hindari transaksi dari callback asinkron yang terlambat.

## Performance Considerations

View fragment di back stack dihancurkan untuk menghemat memori, tetapi state (ViewModel, arguments) tetap ada. Hindari
pekerjaan berat di `onCreateView`; gunakan RecyclerView dengan adapter yang di-null-kan/di-detach saat `onDestroyView`.

## Security Considerations

Arguments dan saved state dapat tersimpan ke disk saat process death — jangan masukkan token atau data sensitif. Untuk
layar sensitif, terapkan `FLAG_SECURE` pada window Activity host.

## Real-World Use Cases

- Aplikasi lama berbasis XML + Fragment + Navigation Component.
- Bottom navigation dengan fragment per tab.
- Migrasi bertahap: `ComposeView` di dalam Fragment.

## Interview Questions

1. Jelaskan lifecycle Fragment.
2. Apa beda lifecycle Fragment dan `viewLifecycleOwner`?
3. Mengapa binding harus di-null-kan di `onDestroyView`?
4. Bagaimana mengirim data antar fragment?
5. Mengapa Fragment tidak boleh punya constructor dengan parameter?

## Sample Answers

1. onAttach → onCreate → onCreateView → onViewCreated → onStart → onResume → onPause → onStop → onDestroyView → onDestroy → onDetach.
2. Fragment dapat tetap hidup (di back stack) sementara view-nya dihancurkan dan dibuat ulang; `viewLifecycleOwner` mengikuti umur view, sehingga observer yang menyentuh view harus memakainya.
3. Saat fragment di back stack, view dihancurkan tetapi objek fragment tetap ada; binding yang masih dipegang menahan seluruh hierarki view (memory leak).
4. Shared ViewModel (scope activity/nav graph), Fragment Result API, atau argumen navigasi (Safe Args) untuk input.
5. Sistem membuat ulang fragment setelah configuration change/process death memakai constructor kosong; data harus lewat `arguments` agar ikut dipulihkan.

## Practical Exercises

1. Log semua callback fragment saat navigasi bolak-balik dan rotasi.
2. Buat leak sengaja (binding tidak di-null-kan) dan deteksi dengan LeakCanary.
3. Ganti komunikasi fragment langsung dengan Fragment Result API.

## Quick Reference

```text
onAttach → onCreate → onCreateView → onViewCreated → onStart → onResume
→ onPause → onStop → onDestroyView → onDestroy → onDetach
Observe: viewLifecycleOwner + repeatOnLifecycle · binding = null di onDestroyView
newInstance + arguments · shared ViewModel / setFragmentResult · constructor kosong
```

## Related Topics

- [Activity Lifecycle](/android/activity-lifecycle/)
- [ViewModel & Lifecycle-Aware Components](/android/viewmodel-lifecycle-aware/)
- [Navigation](/android/navigation/)
