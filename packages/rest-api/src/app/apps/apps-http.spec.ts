import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { rmSync } from 'node:fs';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { createTestDatabase } from '../test/create-test-database.js';

const profile = (appId: string) => ({
  appId,
  name: appId,
  voice: { tone: 'plain', audience: 'testers' },
  allowedBlockTypes: ['paragraph'],
  designTokens: {},
});

describe('Self-serve app registration and deletion (e2e)', () => {
  let app: INestApplication;
  let dbDir: string;
  let httpServer: import('http').Server;

  beforeAll(async () => {
    const db = await createTestDatabase();
    dbDir = db.dir;
    process.env['DATABASE_URL'] = db.url;
    process.env['ADMIN_API_KEY'] = 'unused-in-this-suite';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      /* ignore — see articles-http.spec.ts for why this is best-effort */
    }
  });

  it('registers an app with no admin key at all', async () => {
    const res = await request(httpServer)
      .post('/api/apps/self-serve')
      .send(profile('self-serve-app'))
      .expect(201);

    expect(res.body.profile.appId).toBe('self-serve-app');
    expect(typeof res.body.apiKey).toBe('string');
    expect(res.body.apiKey.length).toBeGreaterThan(10);
  });

  it('still enforces the normal appId conflict rule', async () => {
    await request(httpServer)
      .post('/api/apps/self-serve')
      .send(profile('self-serve-app'))
      .expect(409);
  });

  it('rejects registration once the global cap is reached', async () => {
    process.env['SELF_SERVE_APP_CAP'] = '1';
    try {
      await request(httpServer)
        .post('/api/apps/self-serve')
        .send(profile('over-the-cap'))
        .expect(403);
    } finally {
      delete process.env['SELF_SERVE_APP_CAP'];
    }
  });

  describe('DELETE /apps/:appId', () => {
    it("rejects deletion without the app's key or an admin key", async () => {
      await request(httpServer)
        .post('/api/apps/self-serve')
        .send(profile('delete-me-unauthorized'))
        .expect(201);

      await request(httpServer)
        .delete('/api/apps/delete-me-unauthorized')
        .expect(401);
    });

    it("deletes an app and its articles using the app's own key", async () => {
      const registerRes = await request(httpServer)
        .post('/api/apps/self-serve')
        .send(profile('delete-me-self'))
        .expect(201);
      const apiKey = registerRes.body.apiKey as string;

      await request(httpServer)
        .post('/api/apps/delete-me-self/articles')
        .set('x-api-key', apiKey)
        .send({
          appId: 'delete-me-self',
          slug: 'hello',
          title: 'Hello',
          blocks: [{ type: 'paragraph', content: [{ text: 'Hello' }] }],
        })
        .expect(201);

      await request(httpServer)
        .delete('/api/apps/delete-me-self')
        .set('x-api-key', apiKey)
        .expect(204);

      await request(httpServer).get('/api/apps/delete-me-self').expect(404);
    });

    it('deletes an app using the admin key even without its own key', async () => {
      await request(httpServer)
        .post('/api/apps/self-serve')
        .send(profile('delete-me-admin'))
        .expect(201);

      await request(httpServer)
        .delete('/api/apps/delete-me-admin')
        .set('x-admin-key', 'unused-in-this-suite')
        .expect(204);

      await request(httpServer).get('/api/apps/delete-me-admin').expect(404);
    });

    it('404s deleting an app that does not exist', async () => {
      await request(httpServer)
        .delete('/api/apps/no-such-app')
        .set('x-admin-key', 'unused-in-this-suite')
        .expect(404);
    });
  });
});
