import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 작업 목록: content/work/<slug>.md (작업 하나당 파일 하나)
const work = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/work' }),
  schema: z.object({
    title: z.string(),
    year: z.union([z.string(), z.number()]).transform(String),
    // 미술과 공학이 융합된 작업은 두 태그를 모두 넣는다
    tags: z.array(z.enum(['Engineering', 'Art & Design'])).min(1),
    role: z.string().default(''),
    summary: z.string().default(''),
    thumbnail: z.string(),
    // 영상: 본문 위에 크게. poster = 재생 전 보이는 사진, caption = 영상 아래 한 줄 (선택)
    videos: z
      .array(z.object({ src: z.string(), poster: z.string().optional(), caption: z.string().default('') }))
      .default([]),
    images: z.array(z.object({ src: z.string(), alt: z.string().default('') })).default([]),
    order: z.number().default(0),
  }),
});

export const collections = { work };
