import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'node:path';
import { AppModule } from './app/app.module.js';

/**
 * Nx's serve/build executors run the compiled bundle with the workspace root
 * as process.cwd(), not this project's directory — so a relative
 * `file:./dev.db` in DATABASE_URL would resolve to the wrong place depending
 * on how the app was launched. Anchor it to this project's root (one level
 * up from dist/main.js) instead, so migrate and serve always agree on the
 * same database file.
 */
function resolveSqliteUrl(url: string | undefined): string | undefined {
  const prefix = 'file:';
  if (!url?.startsWith(prefix)) {
    return url;
  }
  const rawPath = url.slice(prefix.length);
  return `${prefix}${join(__dirname, '..', rawPath)}`;
}

process.env['DATABASE_URL'] = resolveSqliteUrl(process.env['DATABASE_URL']);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('AI Article Platform API')
      .setDescription(
        'Multi-tenant article storage: each app registers a profile (voice, allowed block types, design tokens); ' +
          'the same Article schema (see packages/schema) is enforced here, served over MCP, and rendered per-app by the webapp.',
      )
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
      .addApiKey({ type: 'apiKey', name: 'x-admin-key', in: 'header' }, 'adminKey')
      .build(),
  );
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env['PORT'] || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`📖 API docs: http://localhost:${port}/${globalPrefix}/docs`);
}

bootstrap();
