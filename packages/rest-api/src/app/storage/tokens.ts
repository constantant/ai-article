/**
 * DI tokens for the storage ports. StorageModule binds these to Prisma/SQLite
 * (local dev, default) or DynamoDB (STORAGE_DRIVER=dynamodb, used in the AWS
 * deployment) — nothing in the controllers/services changes either way.
 */
export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');
export const APP_PROFILE_REPOSITORY = Symbol('APP_PROFILE_REPOSITORY');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export const DYNAMODB_DOCUMENT_CLIENT = Symbol('DYNAMODB_DOCUMENT_CLIENT');
export const DYNAMODB_CONFIG = Symbol('DYNAMODB_CONFIG');
