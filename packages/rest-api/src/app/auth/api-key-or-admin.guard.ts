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
 * Deleting an app is symmetric with registering one: whoever holds the app's
 * own key can remove it (mirrors register_app's self-serve model), and an
 * operator holding ADMIN_API_KEY can remove any app for cleanup.
 */
@Injectable()
export class ApiKeyOrAdminGuard implements CanActivate {
  constructor(
    @Inject(APP_PROFILE_REPOSITORY) private readonly apps: AppProfileRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const appId = request.params['appId'];
    if (!appId) {
      throw new UnauthorizedException('missing appId');
    }

    const providedAdminKey = request.header('x-admin-key');
    const expectedAdminKey = process.env['ADMIN_API_KEY'];
    if (
      providedAdminKey &&
      expectedAdminKey &&
      providedAdminKey === expectedAdminKey
    ) {
      return true;
    }

    const providedApiKey = request.header('x-api-key');
    if (providedApiKey) {
      const stored = await this.apps.findById(appId);
      if (stored && matchesApiKey(providedApiKey, stored.apiKeyHash)) {
        return true;
      }
    }

    throw new UnauthorizedException(
      "provide this app's x-api-key or a valid x-admin-key",
    );
  }
}
