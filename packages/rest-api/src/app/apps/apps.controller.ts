import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { appProfileSchema, type AppProfile } from '@org/schema';
import { AdminGuard } from '../auth/admin.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AppsService } from './apps.service.js';

@ApiTags('apps')
@Controller('apps')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @ApiOperation({ summary: 'List every registered app profile.' })
  list() {
    return this.apps.list();
  }

  @Get(':appId')
  @ApiOperation({
    summary:
      "Get one app's profile (voice, allowed block types, design tokens).",
  })
  get(@Param('appId') appId: string) {
    return this.apps.get(appId);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Register a new app. Requires x-admin-key. Returns the API key once.',
  })
  create(@Body(new ZodValidationPipe(appProfileSchema)) profile: AppProfile) {
    return this.apps.create(profile);
  }

  @Post('self-serve')
  @ApiOperation({
    summary:
      'Publicly register a new app — no admin key required. Capped globally ' +
      'to bound abuse. Returns the API key once.',
  })
  createSelfServe(
    @Body(new ZodValidationPipe(appProfileSchema)) profile: AppProfile,
  ) {
    return this.apps.createSelfServe(profile);
  }
}
