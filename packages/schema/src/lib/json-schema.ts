import { z } from 'zod';
import { appProfileSchema } from './app-profile.js';
import { articleDraftInputSchema, articleSchema } from './article.js';
import { blockSchema } from './blocks.js';

/**
 * These are the JSON Schema documents served by the MCP server's
 * `schema://article` etc. resources, and used to generate MCP tool
 * input/output schemas — generated from the same Zod definitions the REST
 * API validates against, so no consumer can drift from the contract.
 */
export const articleJsonSchema = () => z.toJSONSchema(articleSchema);
export const articleDraftInputJsonSchema = () =>
  z.toJSONSchema(articleDraftInputSchema);
export const appProfileJsonSchema = () => z.toJSONSchema(appProfileSchema);
export const blockJsonSchema = () => z.toJSONSchema(blockSchema);
