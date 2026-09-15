export interface DynamoDbConfig {
  appsTable: string;
  articlesTable: string;
}

export function loadDynamoDbConfig(): DynamoDbConfig {
  return {
    appsTable: process.env['DYNAMODB_APPS_TABLE'] ?? 'ai-article-apps',
    articlesTable:
      process.env['DYNAMODB_ARTICLES_TABLE'] ?? 'ai-article-articles',
  };
}
