import { z } from 'zod';

/**
 * Public-facing shape only — password/hash material never enters the Zod
 * wire schema, same convention as AppProfile never carrying apiKeyHash.
 */
export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
});
export type User = z.infer<typeof userSchema>;
