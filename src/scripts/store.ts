// Penyimpanan progres belajar di localStorage (per browser).
// Gunakan Export/Import di Dashboard untuk backup atau pindah perangkat.

export interface Visit { slug: string; title: string; ts: number }
export interface CardState { box: number; due: number; seen: number; wrong: number }
export interface StoreData {
  version: 1;
  learned: Record<string, number>;          // slug -> timestamp selesai
  bookmarks: Record<string, { title: string; ts: number }>;
  notes: Record<string, { text: string; ts: number }>;
  weak: Record<string, number>;             // slug -> skor kelemahan (naik jika salah/ "perlu ulang")
  visits: Visit[];                          // riwayat kunjungan terbaru
  cards: Record<string, CardState>;         // id pertanyaan -> status Leitner
  activity: Record<string, number>;         // 'YYYY-MM-DD' -> jumlah aktivitas
}

const KEY = 'sekb:v1';
const empty = (): StoreData => ({
  version: 1, learned: {}, bookmarks: {}, notes: {}, weak: {}, visits: [], cards: {}, activity: {},
});

export function load(): StoreData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export function save(data: StoreData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage penuh / diblokir — abaikan agar halaman tetap jalan */
  }
  window.dispatchEvent(new CustomEvent('sekb:change'));
}

export function update(fn: (d: StoreData) => void) {
  const d = load();
  fn(d);
  save(d);
  return d;
}

export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function logActivity(d: StoreData, n = 1) {
  const k = dayKey();
  d.activity[k] = (d.activity[k] ?? 0) + n;
}

/** Normalisasi pathname menjadi slug konten: '/flutter/testing/' -> 'flutter/testing' */
export const slugFromPath = (p = location.pathname) => p.replace(/^\/+|\/+$/g, '');

export function exportJson() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sekb-progress-${dayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJson(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.version !== 1) throw new Error('Format file tidak dikenali');
  save({ ...empty(), ...parsed });
}

// ---- Leitner spaced repetition --------------------------------------------
// Box 1..5, interval (hari) setelah jawaban benar.
const INTERVAL = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;

export function grade(d: StoreData, id: string, correct: boolean, topic?: string) {
  const c = d.cards[id] ?? { box: 1, due: 0, seen: 0, wrong: 0 };
  c.seen++;
  if (correct) {
    c.box = Math.min(5, c.box + 1);
  } else {
    c.box = 1;
    c.wrong++;
    if (topic) d.weak[topic] = (d.weak[topic] ?? 0) + 1;
  }
  c.due = Date.now() + INTERVAL[c.box] * DAY;
  d.cards[id] = c;
  logActivity(d);
}

export const isDue = (d: StoreData, id: string) => (d.cards[id]?.due ?? 0) <= Date.now();

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
