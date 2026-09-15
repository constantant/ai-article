import { z } from 'zod';
import type { AppProfile } from './app-profile.js';
import type { Article, ArticleDraftInput } from './article.js';
import { articleDraftInputSchema, articleSchema } from './article.js';
import type { Block } from './blocks.js';

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; errors: ValidationError[] };

function zodErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function checkAllowedBlockTypes(blocks: Block[], profile: AppProfile): ValidationError[] {
  return blocks
    .map((block, index) => ({ index, type: block.type }))
    .filter(({ type }) => !profile.allowedBlockTypes.includes(type))
    .map(({ index, type }) => ({
      path: `blocks[${index}]`,
      message: `block type "${type}" is not allowed for app "${profile.appId}"`,
    }));
}

function checkAppMatch(appId: string, profile: AppProfile): ValidationError[] {
  return appId === profile.appId
    ? []
    : [
        {
          path: 'appId',
          message: `article.appId "${appId}" does not match profile "${profile.appId}"`,
        },
      ];
}

/**
 * Validates a full article (as stored, or as submitted for update/publish)
 * against both the shared schema and the destination app's policy. Used
 * identically by the REST API and by the MCP `validate_article` tool so the
 * two never disagree about whether an article is publishable.
 */
export function validateArticle(input: unknown, profile: AppProfile): ValidationResult<Article> {
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: zodErrors(parsed.error) };
  }
  const article = parsed.data;
  const errors = [...checkAppMatch(article.appId, profile), ...checkAllowedBlockTypes(article.blocks, profile)];
  return errors.length > 0 ? { valid: false, errors } : { valid: true, value: article };
}

/** Same as validateArticle, but for the pre-id/status shape used on creation. */
export function validateArticleDraft(
  input: unknown,
  profile: AppProfile,
): ValidationResult<ArticleDraftInput> {
  const parsed = articleDraftInputSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: zodErrors(parsed.error) };
  }
  const draft = parsed.data;
  const errors = [...checkAppMatch(draft.appId, profile), ...checkAllowedBlockTypes(draft.blocks, profile)];
  return errors.length > 0 ? { valid: false, errors } : { valid: true, value: draft };
}
