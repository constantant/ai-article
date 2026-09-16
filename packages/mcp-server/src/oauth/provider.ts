import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { CODE_TTL_SECONDS, JwtIssuer } from './jwt.js';
import { renderLoginPage } from './login-page.js';
import type { AuthorizeFormParams } from './login-page.js';
import type { UsedCodeGuard } from './used-codes.js';
import type { UsersApiClient } from './users-api-client.js';

/**
 * Both the OAuth authorization server AND resource server for this MCP
 * server — single origin, simplest for MCP client discovery. Authorization
 * codes and access/refresh tokens are stateless signed JWTs (see jwt.ts);
 * the only real server-side state this needs is single-use replay
 * protection for codes (usedCodes) and durable registered-client storage
 * (clientsStore) — both explained where they're used below.
 */
export class AiArticleOAuthProvider implements OAuthServerProvider {
  constructor(
    readonly clientsStore: OAuthRegisteredClientsStore,
    private readonly jwt: JwtIssuer,
    private readonly usedCodes: UsedCodeGuard,
    private readonly usersApi: UsersApiClient,
  ) {}

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const req = res.req;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const formAction =
      typeof body['formAction'] === 'string' ? body['formAction'] : undefined;
    const email = typeof body['email'] === 'string' ? body['email'] : undefined;
    const password =
      typeof body['password'] === 'string' ? body['password'] : undefined;

    const scope = (params.scopes ?? []).join(' ');
    const formParams: AuthorizeFormParams = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      scope,
      state: params.state,
      codeChallenge: params.codeChallenge,
      resource: params.resource?.href,
    };

    if (!formAction || !email || !password) {
      res.status(200).type('html').send(renderLoginPage(formParams));
      return;
    }

    let userId: string;
    if (formAction === 'register') {
      try {
        const user = await this.usersApi.register(email, password);
        userId = user.id;
      } catch (error) {
        res
          .status(200)
          .type('html')
          .send(
            renderLoginPage(
              formParams,
              error instanceof Error ? error.message : 'registration failed',
            ),
          );
        return;
      }
    } else {
      const result = await this.usersApi.verifyCredentials(email, password);
      if (!result) {
        res
          .status(200)
          .type('html')
          .send(renderLoginPage(formParams, 'invalid email or password'));
        return;
      }
      userId = result.userId;
    }

    const code = await this.jwt.signCode({
      sub: userId,
      clientId: client.client_id,
      scope,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      jti: randomUUID(),
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }
    res.redirect(302, redirectUrl.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const claims = await this.jwt.verifyCode(authorizationCode).catch(() => {
      throw new InvalidGrantError('invalid or expired authorization code');
    });
    if (claims.clientId !== client.client_id) {
      throw new InvalidGrantError(
        'authorization code was not issued to this client',
      );
    }
    return claims.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const claims = await this.jwt.verifyCode(authorizationCode).catch(() => {
      throw new InvalidGrantError('invalid or expired authorization code');
    });
    if (claims.clientId !== client.client_id) {
      throw new InvalidGrantError(
        'authorization code was not issued to this client',
      );
    }
    if (redirectUri && redirectUri !== claims.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match');
    }

    const firstUse = await this.usedCodes.claim(claims.jti, CODE_TTL_SECONDS);
    if (!firstUse) {
      throw new InvalidGrantError('authorization code already used');
    }

    return this.mintTokens(claims.sub, client.client_id, claims.scope);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const claims = await this.jwt.verifyRefreshToken(refreshToken).catch(() => {
      throw new InvalidGrantError('invalid or expired refresh token');
    });
    if (claims.clientId !== client.client_id) {
      throw new InvalidGrantError(
        'refresh token was not issued to this client',
      );
    }
    const scope = scopes && scopes.length > 0 ? scopes.join(' ') : claims.scope;
    return this.mintTokens(claims.sub, client.client_id, scope);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const claims = await this.jwt.verifyAccessToken(token).catch(() => {
      throw new InvalidTokenError('invalid or expired access token');
    });
    return {
      token,
      clientId: claims.clientId,
      scopes: claims.scope ? claims.scope.split(' ') : [],
      expiresAt: claims.exp,
      extra: { userId: claims.sub },
    };
  }

  // No revokeToken: a documented tradeoff of the stateless-JWT design —
  // tokens expire on their own TTL but can't be revoked early.

  private async mintTokens(
    userId: string,
    clientId: string,
    scope: string,
  ): Promise<OAuthTokens> {
    const access = await this.jwt.signAccessToken({
      sub: userId,
      clientId,
      scope,
    });
    const refreshToken = await this.jwt.signRefreshToken({
      sub: userId,
      clientId,
      scope,
    });
    return {
      access_token: access.token,
      token_type: 'bearer',
      expires_in: access.expiresAt - Math.floor(Date.now() / 1000),
      refresh_token: refreshToken,
      scope: scope || undefined,
    };
  }
}
