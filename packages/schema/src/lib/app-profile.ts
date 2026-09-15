import { z } from 'zod';
import { BLOCK_TYPES } from './blocks.js';

export const appVoiceSchema = z.object({
  tone: z.string().min(1),
  audience: z.string().min(1),
  doNots: z.array(z.string()).optional(),
});
export type AppVoice = z.infer<typeof appVoiceSchema>;

/**
 * Flat design-token map (e.g. "color-surface" -> "#0b0f1a"), applied by a
 * webapp as CSS custom properties. The Skill never reads this — presentation
 * stays entirely the receiving app's responsibility.
 */
export const designTokensSchema = z.record(z.string(), z.string());
export type DesignTokens = z.infer<typeof designTokensSchema>;

export const appProfileSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  voice: appVoiceSchema,
  allowedBlockTypes: z.array(z.enum(BLOCK_TYPES)).min(1),
  contentConventions: z.string().optional(),
  designTokens: designTokensSchema,
  exampleArticleIds: z.array(z.string()).optional(),
});
export type AppProfile = z.infer<typeof appProfileSchema>;
