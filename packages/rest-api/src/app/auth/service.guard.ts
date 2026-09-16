import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Gates endpoints that only the mcp-server backend should ever call on a
 * user's behalf (credential verification, reading/writing a user's own
 * per-app API keys) behind a shared service key from env — never exposed to
 * end users, who authenticate to mcp-server via OAuth instead.
 */
@Injectable()
export class ServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-service-key');
    const expected = process.env['MCP_SERVICE_KEY'];

    if (!expected) {
      throw new UnauthorizedException(
        'MCP_SERVICE_KEY is not configured on the server',
      );
    }
    if (provided !== expected) {
      throw new UnauthorizedException('invalid x-service-key');
    }
    return true;
  }
}
