import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { rmSync } from 'node:fs';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { createTestDatabase } from '../test/create-test-database.js';

const ADMIN_KEY = 'test-admin-key';

describe('Articles flow (e2e)', () => {
  let app: INestApplication;
  let dbDir: string;
  let httpServer: import('http').Server;

  beforeAll(async () => {
    const db = await createTestDatabase();
    dbDir = db.dir;
    process.env['DATABASE_URL'] = db.url;
    process.env['ADMIN_API_KEY'] = ADMIN_KEY;

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
    // Best-effort: libsql's native handle can hold the file lock past
    // $disconnect() on Windows. A stray temp dir is harmless, so don't fail
    // the suite over cleanup.
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('rejects app registration without the admin key', async () => {
    await request(httpServer)
      .post('/api/apps')
      .send({
        appId: 'x',
        name: 'X',
        voice: { tone: 't', audience: 'a' },
        allowedBlockTypes: ['paragraph'],
        designTokens: {},
      })
      .expect(401);
  });

  it('registers an app and issues an API key', async () => {
    const res = await request(httpServer)
      .post('/api/apps')
      .set('x-admin-key', ADMIN_KEY)
      .send({
        appId: 'test-app',
        name: 'Test App',
        voice: { tone: 'plain', audience: 'testers' },
        allowedBlockTypes: ['heading', 'paragraph'],
        designTokens: { 'color-surface': '#fff' },
      })
      .expect(201);

    expect(res.body.profile.appId).toBe('test-app');
    expect(typeof res.body.apiKey).toBe('string');
    expect(res.body.apiKey.length).toBeGreaterThan(10);
  });

  describe('article lifecycle for a registered app', () => {
    let apiKey: string;

    beforeAll(async () => {
      const res = await request(httpServer)
        .post('/api/apps')
        .set('x-admin-key', ADMIN_KEY)
        .send({
          appId: 'lifecycle-app',
          name: 'Lifecycle App',
          voice: { tone: 'plain', audience: 'testers' },
          allowedBlockTypes: ['heading', 'paragraph', 'code'],
          designTokens: {},
        });
      apiKey = res.body.apiKey;
    });

    it('rejects article creation with no api key', async () => {
      await request(httpServer)
        .post('/api/apps/lifecycle-app/articles')
        .send({})
        .expect(401);
    });

    it('rejects article creation with the wrong api key', async () => {
      await request(httpServer)
        .post('/api/apps/lifecycle-app/articles')
        .set('x-api-key', 'not-the-real-key')
        .send({})
        .expect(401);
    });

    it('rejects a block type the app does not allow', async () => {
      const res = await request(httpServer)
        .post('/api/apps/lifecycle-app/articles/validate')
        .set('x-api-key', apiKey)
        .send({
          appId: 'lifecycle-app',
          slug: 'bad',
          title: 'Bad',
          blocks: [
            {
              type: 'embed',
              provider: 'youtube',
              url: 'https://youtube.com/x',
            },
          ],
        })
        .expect(201);

      expect(res.body.valid).toBe(false);
      expect(res.body.errors[0].message).toContain('"embed"');
    });

    it('creates a draft, publishes it, and serves it publicly', async () => {
      const created = await request(httpServer)
        .post('/api/apps/lifecycle-app/articles')
        .set('x-api-key', apiKey)
        .send({
          appId: 'lifecycle-app',
          slug: 'hello',
          title: 'Hello',
          blocks: [{ type: 'heading', level: 1, text: 'Hello' }],
        })
        .expect(201);

      expect(created.body.status).toBe('draft');

      await request(httpServer)
        .get('/api/apps/lifecycle-app/articles/by-slug/hello')
        .expect(404);

      await request(httpServer)
        .post(`/api/apps/lifecycle-app/articles/${created.body.id}/publish`)
        .set('x-api-key', apiKey)
        .expect(201);

      const published = await request(httpServer)
        .get('/api/apps/lifecycle-app/articles/by-slug/hello')
        .expect(200);
      expect(published.body.status).toBe('published');

      const list = await request(httpServer)
        .get('/api/apps/lifecycle-app/articles')
        .expect(200);
      expect(list.body.map((a: { slug: string }) => a.slug)).toContain('hello');
    });
  });
});
