import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Gates app-registration (POST /apps) behind a single shared admin key from
 * env — proportionate for a test system with no real operator accounts, not
 * meant as production-grade auth.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-admin-key');
    const expected = process.env['ADMIN_API_KEY'];

    if (!expected) {
      throw new UnauthorizedException(
        'ADMIN_API_KEY is not configured on the server',
      );
    }
    if (provided !== expected) {
      throw new UnauthorizedException('invalid x-admin-key');
    }
    return true;
  }
}
