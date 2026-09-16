import type { AppProfile } from '@org/schema';

export interface StoredAppProfile {
  profile: AppProfile;
  apiKeyHash: string;
}

export class AppIdConflictError extends Error {
  constructor(appId: string) {
    super(`app "${appId}" already exists`);
    this.name = 'AppIdConflictError';
  }
}

export interface AppProfileRepository {
  create(profile: AppProfile, apiKeyHash: string): Promise<void>;
  findById(appId: string): Promise<StoredAppProfile | null>;
  list(): Promise<AppProfile[]>;
  deleteById(appId: string): Promise<void>;
}
