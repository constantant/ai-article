import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppProfile } from '@org/schema';
import { generateApiKey, hashApiKey } from '../common/api-key.js';
import { AppIdConflictError } from '../storage/app-profile-repository.port.js';
import type { AppProfileRepository } from '../storage/app-profile-repository.port.js';
import { APP_PROFILE_REPOSITORY } from '../storage/tokens.js';

@Injectable()
export class AppsService {
  constructor(
    @Inject(APP_PROFILE_REPOSITORY) private readonly repo: AppProfileRepository,
  ) {}

  async create(
    profile: AppProfile,
  ): Promise<{ profile: AppProfile; apiKey: string }> {
    const apiKey = generateApiKey();
    try {
      await this.repo.create(profile, hashApiKey(apiKey));
    } catch (error) {
      if (error instanceof AppIdConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    return { profile, apiKey };
  }

  async get(appId: string): Promise<AppProfile> {
    const stored = await this.repo.findById(appId);
    if (!stored) {
      throw new NotFoundException(`app "${appId}" not found`);
    }
    return stored.profile;
  }

  async list(): Promise<AppProfile[]> {
    return this.repo.list();
  }
}
