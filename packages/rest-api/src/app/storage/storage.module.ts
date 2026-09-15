import { Module } from '@nestjs/common';
import { PrismaArticleRepository } from './prisma-article.repository.js';
import { PrismaAppProfileRepository } from './prisma-app-profile.repository.js';
import { APP_PROFILE_REPOSITORY, ARTICLE_REPOSITORY } from './tokens.js';

@Module({
  providers: [
    { provide: ARTICLE_REPOSITORY, useClass: PrismaArticleRepository },
    { provide: APP_PROFILE_REPOSITORY, useClass: PrismaAppProfileRepository },
  ],
  exports: [ARTICLE_REPOSITORY, APP_PROFILE_REPOSITORY],
})
export class StorageModule {}
