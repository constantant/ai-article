import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { AdminGuard } from './admin.guard.js';
import { ApiKeyGuard } from './api-key.guard.js';

@Module({
  imports: [StorageModule],
  providers: [ApiKeyGuard, AdminGuard],
  exports: [ApiKeyGuard, AdminGuard],
})
export class AuthModule {}
