#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { AiArticleStack } from '../lib/ai-article-stack';

const app = new App();

new AiArticleStack(app, 'AiArticleStack', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'eu-central-1',
  },
});
