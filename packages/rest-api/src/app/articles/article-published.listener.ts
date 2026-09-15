import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Article } from '@org/schema';
import { PublishEvents } from './publish-events.js';

@Injectable()
export class ArticlePublishedListener implements OnModuleInit {
  private readonly logger = new Logger(ArticlePublishedListener.name);

  constructor(private readonly events: PublishEvents) {}

  onModuleInit(): void {
    this.events.onPublished((article: Article) => {
      this.logger.log(`published ${article.appId}/${article.slug} (${article.id})`);
    });
  }
}
