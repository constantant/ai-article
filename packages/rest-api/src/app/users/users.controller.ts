import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ServiceGuard } from '../auth/service.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
type Credentials = z.infer<typeof credentialsSchema>;

const apiKeyBodySchema = z.object({ apiKey: z.string().min(1) });
type ApiKeyBody = z.infer<typeof apiKeyBodySchema>;

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('register')
  @ApiOperation({
    summary:
      'Publicly self-serve register a user account for the mobile MCP ' +
      'connector — no admin key required, capped globally. No email ' +
      'verification, password reset, or MFA: email is a self-serve ' +
      'username, same trust level as self-serve app registration.',
  })
  register(@Body(new ZodValidationPipe(credentialsSchema)) body: Credentials) {
    return this.users.register(body.email, body.password);
  }

  @Post('verify-credentials')
  @UseGuards(ServiceGuard)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Service-to-service only (x-service-key): verify email/password. ' +
      "Used by mcp-server's OAuth login flow — never called by end users directly.",
  })
  async verifyCredentials(
    @Body(new ZodValidationPipe(credentialsSchema)) body: Credentials,
  ) {
    const result = await this.users.verifyCredentials(
      body.email,
      body.password,
    );
    if (!result) {
      throw new UnauthorizedException('invalid email or password');
    }
    return result;
  }

  @Get(':userId/app-keys')
  @UseGuards(ServiceGuard)
  @ApiOperation({
    summary:
      "Service-to-service only: list a user's linked {appId: apiKey} pairs.",
  })
  listAppKeys(@Param('userId') userId: string) {
    return this.users.listAppKeys(userId);
  }

  @Put(':userId/app-keys/:appId')
  @UseGuards(ServiceGuard)
  @ApiOperation({
    summary:
      "Service-to-service only: link or update one of a user's app API keys.",
  })
  putAppKey(
    @Param('userId') userId: string,
    @Param('appId') appId: string,
    @Body(new ZodValidationPipe(apiKeyBodySchema)) body: ApiKeyBody,
  ) {
    return this.users.putAppKey(userId, appId, body.apiKey);
  }

  @Delete(':userId/app-keys/:appId')
  @UseGuards(ServiceGuard)
  @HttpCode(204)
  @ApiOperation({
    summary: "Service-to-service only: unlink one of a user's app API keys.",
  })
  deleteAppKey(@Param('userId') userId: string, @Param('appId') appId: string) {
    return this.users.deleteAppKey(userId, appId);
  }
}
