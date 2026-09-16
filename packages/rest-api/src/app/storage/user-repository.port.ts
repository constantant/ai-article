export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
}

export class EmailConflictError extends Error {
  constructor(email: string) {
    super(`email "${email}" already registered`);
    this.name = 'EmailConflictError';
  }
}

/**
 * App-key associations are bundled into this same port rather than split
 * into a separate repository — small enough per user not to warrant one,
 * and it keeps a user's profile and their linked app keys together the way
 * articles already keep everything under their owning appId.
 */
export interface UserRepository {
  create(email: string, passwordHash: string): Promise<StoredUser>;
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  count(): Promise<number>;
  putAppKey(userId: string, appId: string, apiKey: string): Promise<void>;
  deleteAppKey(userId: string, appId: string): Promise<void>;
  listAppKeys(userId: string): Promise<Record<string, string>>;
}
