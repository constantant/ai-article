import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '../common/password.js';
import { EmailConflictError } from '../storage/user-repository.port.js';
import type { UserRepository } from '../storage/user-repository.port.js';
import { USER_REPOSITORY } from '../storage/tokens.js';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: UserRepository,
  ) {}

  /**
   * Public, unauthenticated registration for zero-setup mobile-connector
   * login — no admin key, but no email verification, password reset, or
   * MFA either: email is a self-serve username here, matching the trust
   * level this project already gives self-serve app registration (see
   * AppsService#createSelfServe). Capped globally for the same reason that
   * cap exists: the Lambda deployment is stateless across invocations, so
   * per-IP rate limiting isn't reliable here without extra infra.
   */
  async register(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const cap = Number(process.env['SELF_SERVE_USER_CAP'] ?? 200);
    const total = await this.repo.count();
    if (total >= cap) {
      throw new ForbiddenException(
        'self-serve registration is full for now — try again later',
      );
    }
    try {
      const user = await this.repo.create(email, hashPassword(password));
      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof EmailConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<{ userId: string } | null> {
    const user = await this.repo.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return null;
    }
    return { userId: user.id };
  }

  async listAppKeys(userId: string): Promise<Record<string, string>> {
    await this.requireUser(userId);
    return this.repo.listAppKeys(userId);
  }

  async putAppKey(userId: string, appId: string, apiKey: string): Promise<void> {
    await this.requireUser(userId);
    await this.repo.putAppKey(userId, appId, apiKey);
  }

  async deleteAppKey(userId: string, appId: string): Promise<void> {
    await this.requireUser(userId);
    await this.repo.deleteAppKey(userId, appId);
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundException(`user "${userId}" not found`);
    }
  }
}
