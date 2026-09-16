import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DynamoAppProfileRepository } from './dynamodb-app-profile.repository.js';
import { DynamoArticleRepository } from './dynamodb-article.repository.js';
import { DynamoUserRepository } from './dynamodb-user.repository.js';
import { loadDynamoDbConfig } from './dynamodb-config.js';
import { createDynamoDbDocumentClient } from './dynamodb-client.js';
import { PrismaArticleRepository } from './prisma-article.repository.js';
import { PrismaAppProfileRepository } from './prisma-app-profile.repository.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import {
  APP_PROFILE_REPOSITORY,
  ARTICLE_REPOSITORY,
  DYNAMODB_CONFIG,
  DYNAMODB_DOCUMENT_CLIENT,
  USER_REPOSITORY,
} from './tokens.js';

/**
 * The single place that decides where articles/app-profiles live.
 * STORAGE_DRIVER=dynamodb (set in the AWS deployment) switches to DynamoDB and
 * never constructs PrismaService, so no libsql/SQLite code path runs there at
 * all. Unset (local dev, tests) keeps the existing Prisma/SQLite behavior.
 * Nothing outside this module — controllers, services, guards — knows or
 * cares which one is active; they only depend on the ARTICLE_REPOSITORY /
 * APP_PROFILE_REPOSITORY tokens.
 */
const useDynamoDb = process.env['STORAGE_DRIVER'] === 'dynamodb';

@Module({
  providers: useDynamoDb
    ? [
        {
          provide: DYNAMODB_DOCUMENT_CLIENT,
          useFactory: createDynamoDbDocumentClient,
        },
        { provide: DYNAMODB_CONFIG, useFactory: loadDynamoDbConfig },
        { provide: ARTICLE_REPOSITORY, useClass: DynamoArticleRepository },
        {
          provide: APP_PROFILE_REPOSITORY,
          useClass: DynamoAppProfileRepository,
        },
        { provide: USER_REPOSITORY, useClass: DynamoUserRepository },
      ]
    : [
        PrismaService,
        { provide: ARTICLE_REPOSITORY, useClass: PrismaArticleRepository },
        {
          provide: APP_PROFILE_REPOSITORY,
          useClass: PrismaAppProfileRepository,
        },
        { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
      ],
  exports: [ARTICLE_REPOSITORY, APP_PROFILE_REPOSITORY, USER_REPOSITORY],
})
export class StorageModule {}
