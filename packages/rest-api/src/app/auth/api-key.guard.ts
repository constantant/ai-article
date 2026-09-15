import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { matchesApiKey } from '../common/api-key.js';
import type { AppProfileRepository } from '../storage/app-profile-repository.port.js';
import { APP_PROFILE_REPOSITORY } from '../storage/tokens.js';

/**
 * Write endpoints are always scoped under /apps/:appId/..., so the app the
 * caller is authenticating against comes from the route itself — the guard
 * loads that app's stored key hash and compares it to the provided key.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(APP_PROFILE_REPOSITORY) private readonly apps: AppProfileRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const appId = request.params['appId'];
    const providedKey = request.header('x-api-key');

    if (!appId || !providedKey) {
      throw new UnauthorizedException('missing x-api-key header');
    }

    const stored = await this.apps.findById(appId);
    if (!stored) {
      throw new UnauthorizedException(`unknown app "${appId}"`);
    }

    if (!matchesApiKey(providedKey, stored.apiKeyHash)) {
      throw new UnauthorizedException('invalid x-api-key');
    }

    return true;
  }
}
