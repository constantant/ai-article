/**
 * DI tokens for the storage ports. Bound to Prisma/SQLite implementations in
 * storage.module.ts today; a future Mongo/Postgres adapter for a different
 * app just needs to bind these same tokens to a different provider — nothing
 * in the controllers/services changes.
 */
export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');
export const APP_PROFILE_REPOSITORY = Symbol('APP_PROFILE_REPOSITORY');
