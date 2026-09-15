import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ArticlePublishedListener } from './article-published.listener.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { PublishEvents } from './publish-events.js';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, PublishEvents, ArticlePublishedListener],
})
export class ArticlesModule {}
