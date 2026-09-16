import {
  ConflictException,
  ForbiddenException,
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

  /**
   * Public, unauthenticated registration for a zero-setup install (no admin
   * key). The Lambda deployment is stateless across invocations, so per-IP
   * rate limiting isn't reliable here without extra infra — a global cap on
   * total apps is the abuse guard for now.
   */
  async createSelfServe(
    profile: AppProfile,
  ): Promise<{ profile: AppProfile; apiKey: string }> {
    const cap = Number(process.env['SELF_SERVE_APP_CAP'] ?? 30);
    const existing = await this.repo.list();
    if (existing.length >= cap) {
      throw new ForbiddenException(
        'self-serve app registration is full for now — ask the maintainer to register your app',
      );
    }
    return this.create(profile);
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
