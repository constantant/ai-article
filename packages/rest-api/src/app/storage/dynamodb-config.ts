export interface DynamoDbConfig {
  appsTable: string;
  articlesTable: string;
  usersTable: string;
}

export function loadDynamoDbConfig(): DynamoDbConfig {
  return {
    appsTable: process.env['DYNAMODB_APPS_TABLE'] ?? 'ai-article-apps',
    articlesTable:
      process.env['DYNAMODB_ARTICLES_TABLE'] ?? 'ai-article-articles',
    usersTable: process.env['DYNAMODB_USERS_TABLE'] ?? 'ai-article-users',
  };
}
