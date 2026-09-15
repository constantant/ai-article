import 'dotenv/config';
import type { AppProfile } from '@org/schema';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { generateApiKey, hashApiKey } from '../src/app/common/api-key.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Two demo apps with deliberately different voice/tokens — this pair is what
 * proves the "same article schema, different house style" story end to end.
 */
const demoProfiles: AppProfile[] = [
  {
    appId: 'tech-blog',
    name: 'Tech Blog',
    voice: {
      tone: 'terse, technical, no fluff',
      audience: 'software engineers',
      doNots: ['marketing speak', 'unexplained jargon without a code example'],
    },
    allowedBlockTypes: ['heading', 'paragraph', 'code', 'list', 'callout', 'quote', 'divider', 'image'],
    contentConventions: 'Open with the problem, not a preamble. Prefer code blocks over prose when showing behavior.',
    designTokens: {
      'color-surface': '#0b0f1a',
      'color-on-surface': '#e2e8f0',
      'color-primary': '#22d3ee',
      'color-primary-container': '#0e7490',
      'font-family-heading': "'JetBrains Mono', monospace",
      'font-family-body': "'Inter', sans-serif",
      'radius-md': '4px',
    },
  },
  {
    appId: 'lifestyle',
    name: 'Lifestyle Magazine',
    voice: {
      tone: 'warm, conversational, personal',
      audience: 'general readers looking for inspiration',
      doNots: ['dense technical detail', 'code or command-line examples'],
    },
    allowedBlockTypes: ['heading', 'paragraph', 'image', 'quote', 'list', 'callout', 'divider', 'embed'],
    contentConventions: 'Open with a relatable scene or anecdote. Favor short paragraphs and a generous lead image.',
    designTokens: {
      'color-surface': '#fffaf3',
      'color-on-surface': '#3f2d1d',
      'color-primary': '#d97757',
      'color-primary-container': '#f4c9a8',
      'font-family-heading': "'Playfair Display', serif",
      'font-family-body': "'Lora', serif",
      'radius-md': '16px',
    },
  },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url: process.env['DATABASE_URL'] ?? 'file:./dev.db' }),
  });

  for (const profile of demoProfiles) {
    const existing = await prisma.app.findUnique({ where: { id: profile.appId } });
    if (existing) {
      console.log(`skip "${profile.appId}" — already seeded`);
      continue;
    }

    const apiKey = generateApiKey();
    await prisma.app.create({
      data: {
        id: profile.appId,
        name: profile.name,
        voiceTone: profile.voice.tone,
        voiceAudience: profile.voice.audience,
        voiceDoNots: profile.voice.doNots ?? null,
        allowedBlockTypes: profile.allowedBlockTypes,
        contentConventions: profile.contentConventions ?? null,
        designTokens: profile.designTokens,
        exampleArticleIds: profile.exampleArticleIds ?? null,
        apiKeyHash: hashApiKey(apiKey),
      },
    });

    console.log(`seeded "${profile.appId}" — x-api-key: ${apiKey}`);
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
