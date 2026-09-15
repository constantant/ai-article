import { z } from 'zod';
import { blockSchema } from './blocks.js';

export const ARTICLE_SCHEMA_VERSION = 1;

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated');

export const articleMetaSchema = z.object({
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
  coverImage: z.url().optional(),
  /** Language the article content is written in, independent of the webapp's UI locale. */
  locale: z.string().optional(),
});
export type ArticleMeta = z.infer<typeof articleMetaSchema>;

export const articleStatusSchema = z.enum(['draft', 'published']);
export type ArticleStatus = z.infer<typeof articleStatusSchema>;

export const articleSchema = z.object({
  id: z.string().min(1),
  appId: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional(),
  status: articleStatusSchema,
  schemaVersion: z.literal(ARTICLE_SCHEMA_VERSION),
  meta: articleMetaSchema.optional(),
  blocks: z.array(blockSchema).min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Article = z.infer<typeof articleSchema>;

/**
 * Shape accepted from a client authoring a new article: no id/timestamps/status
 * yet (the REST API assigns those), schemaVersion defaults so callers don't have
 * to know the current version number.
 */
export const articleDraftInputSchema = articleSchema
  .omit({
    id: true,
    status: true,
    schemaVersion: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    schemaVersion: z.literal(ARTICLE_SCHEMA_VERSION).default(ARTICLE_SCHEMA_VERSION),
  });
export type ArticleDraftInput = z.infer<typeof articleDraftInputSchema>;

export const articleUpdateInputSchema = articleDraftInputSchema.partial().extend({
  id: z.string().min(1),
});
export type ArticleUpdateInput = z.infer<typeof articleUpdateInputSchema>;
