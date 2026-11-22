import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** Tingkat kesulitan materi */
        level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        /** complete = 15 section lengkap, draft = sebagian, stub = belum ditulis */
        status: z.enum(['complete', 'draft', 'stub']).optional(),
        /** Teknologi/versi yang menjadi acuan materi (materi version-dependent) */
        version: z.string().optional(),
        /** Tanggal terakhir materi diperbarui (YYYY-MM-DD) */
        updated: z.coerce.date().optional(),
        tags: z.array(z.string()).optional(),
        /** Sembunyikan tombol progress (untuk halaman tool / index) */
        trackable: z.boolean().default(true),
      }),
    }),
  }),
};
