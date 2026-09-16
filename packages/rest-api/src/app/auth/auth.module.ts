import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { AdminGuard } from './admin.guard.js';
import { ApiKeyOrAdminGuard } from './api-key-or-admin.guard.js';
import { ApiKeyGuard } from './api-key.guard.js';

@Module({
  imports: [StorageModule],
  providers: [ApiKeyGuard, AdminGuard, ApiKeyOrAdminGuard],
  exports: [ApiKeyGuard, AdminGuard, ApiKeyOrAdminGuard],
})
export class AuthModule {}
