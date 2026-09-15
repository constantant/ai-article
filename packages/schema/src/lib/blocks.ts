import { z } from 'zod';

/**
 * The bounded vocabulary of block types. Freedom of structure comes from
 * composing these, not from allowing arbitrary markup — that's what lets a
 * single article render correctly under any app's theme.
 */
export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'image',
  'code',
  'quote',
  'list',
  'callout',
  'table',
  'embed',
  'divider',
  'raw',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const textRunSchema = z.object({
  text: z.string().min(1),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  code: z.boolean().optional(),
  href: z.url().optional(),
});
export type TextRun = z.infer<typeof textRunSchema>;

export const richTextSchema = z.array(textRunSchema).min(1);
export type RichText = z.infer<typeof richTextSchema>;

const headingBlockSchema = z.object({
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string().min(1),
});

const paragraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  content: richTextSchema,
});

const imageBlockSchema = z.object({
  type: z.literal('image'),
  src: z.url(),
  alt: z.string().min(1),
  caption: z.string().optional(),
});

const codeBlockSchema = z.object({
  type: z.literal('code'),
  lang: z.string().optional(),
  code: z.string().min(1),
});

const quoteBlockSchema = z.object({
  type: z.literal('quote'),
  content: richTextSchema,
  attribution: z.string().optional(),
});

const listBlockSchema = z.object({
  type: z.literal('list'),
  ordered: z.boolean(),
  items: z.array(richTextSchema).min(1),
});

const calloutBlockSchema = z.object({
  type: z.literal('callout'),
  variant: z.enum(['info', 'warning', 'success', 'danger']),
  content: richTextSchema,
});

const tableBlockSchema = z.object({
  type: z.literal('table'),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
});

const embedBlockSchema = z.object({
  type: z.literal('embed'),
  provider: z.enum(['youtube', 'twitter', 'codepen', 'generic']),
  url: z.url(),
});

const dividerBlockSchema = z.object({
  type: z.literal('divider'),
});

/** Escape hatch for apps that opt into raw HTML via AppProfile.allowedBlockTypes. */
const rawBlockSchema = z.object({
  type: z.literal('raw'),
  html: z.string().min(1),
});

export const blockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  imageBlockSchema,
  codeBlockSchema,
  quoteBlockSchema,
  listBlockSchema,
  calloutBlockSchema,
  tableBlockSchema,
  embedBlockSchema,
  dividerBlockSchema,
  rawBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;
export type HeadingBlock = z.infer<typeof headingBlockSchema>;
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type CodeBlock = z.infer<typeof codeBlockSchema>;
export type QuoteBlock = z.infer<typeof quoteBlockSchema>;
export type ListBlock = z.infer<typeof listBlockSchema>;
export type CalloutBlock = z.infer<typeof calloutBlockSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type EmbedBlock = z.infer<typeof embedBlockSchema>;
export type DividerBlock = z.infer<typeof dividerBlockSchema>;
export type RawBlock = z.infer<typeof rawBlockSchema>;
