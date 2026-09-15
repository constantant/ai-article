import { describe, expect, it } from 'vitest';
import type { AppProfile } from './app-profile.js';
import { ARTICLE_SCHEMA_VERSION } from './article.js';
import { validateArticle, validateArticleDraft } from './validate.js';

const techBlogProfile: AppProfile = {
  appId: 'tech-blog',
  name: 'Tech Blog',
  voice: { tone: 'terse, technical', audience: 'engineers' },
  allowedBlockTypes: ['heading', 'paragraph', 'code', 'list', 'divider'],
  designTokens: { 'color-surface': '#0b0f1a' },
};

function validArticle() {
  return {
    id: 'article-1',
    appId: 'tech-blog',
    slug: 'hello-world',
    title: 'Hello World',
    status: 'published' as const,
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    blocks: [
      { type: 'heading', level: 1, text: 'Hello' },
      { type: 'paragraph', content: [{ text: 'A short intro.' }] },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('validateArticle', () => {
  it('accepts a well-formed article whose blocks are all allowed for the app', () => {
    const result = validateArticle(validArticle(), techBlogProfile);
    expect(result.valid).toBe(true);
  });

  it('rejects a block type the app profile does not allow', () => {
    const article = validArticle();
    article.blocks.push({
      type: 'raw',
      html: '<script>evil()</script>',
    } as never);

    const result = validateArticle(article, techBlogProfile);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual([
        expect.objectContaining({
          path: 'blocks[2]',
          message: expect.stringContaining('"raw"'),
        }),
      ]);
    }
  });

  it('rejects a malformed article that fails schema validation', () => {
    const article = { ...validArticle(), blocks: [] };

    const result = validateArticle(article, techBlogProfile);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === 'blocks')).toBe(true);
    }
  });

  it('rejects an article whose appId does not match the profile', () => {
    const article = { ...validArticle(), appId: 'lifestyle' };

    const result = validateArticle(article, techBlogProfile);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.path === 'appId')).toBe(true);
    }
  });
});

describe('validateArticleDraft', () => {
  it('accepts a draft without id/status/timestamps', () => {
    const { id, status, createdAt, updatedAt, ...draft } = validArticle();

    const result = validateArticleDraft(draft, techBlogProfile);

    expect(result.valid).toBe(true);
  });

  it('rejects a draft using a block type outside the profile', () => {
    const { id, status, createdAt, updatedAt, ...draft } = validArticle();
    (draft as { blocks: unknown[] }).blocks.push({
      type: 'embed',
      provider: 'youtube',
      url: 'https://youtube.com/x',
    });

    const result = validateArticleDraft(draft, techBlogProfile);

    expect(result.valid).toBe(false);
  });
});
