import { Injectable } from '@nestjs/common';
import type { AppProfile, BlockType } from '@org/schema';
import { Prisma } from '../../generated/prisma/client.js';
import type { App as AppRow } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppIdConflictError, AppProfileRepository, StoredAppProfile } from './app-profile-repository.port.js';

function toProfile(row: AppRow): AppProfile {
  return {
    appId: row.id,
    name: row.name,
    voice: {
      tone: row.voiceTone,
      audience: row.voiceAudience,
      doNots: (row.voiceDoNots as string[] | null) ?? undefined,
    },
    allowedBlockTypes: row.allowedBlockTypes as BlockType[],
    contentConventions: row.contentConventions ?? undefined,
    designTokens: row.designTokens as Record<string, string>,
    exampleArticleIds: (row.exampleArticleIds as string[] | null) ?? undefined,
  };
}

@Injectable()
export class PrismaAppProfileRepository implements AppProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(profile: AppProfile, apiKeyHash: string): Promise<void> {
    try {
      await this.prisma.app.create({
        data: {
          id: profile.appId,
          name: profile.name,
          voiceTone: profile.voice.tone,
          voiceAudience: profile.voice.audience,
          voiceDoNots: (profile.voice.doNots ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          allowedBlockTypes: profile.allowedBlockTypes as unknown as Prisma.InputJsonValue,
          contentConventions: profile.contentConventions ?? null,
          designTokens: profile.designTokens as unknown as Prisma.InputJsonValue,
          exampleArticleIds: (profile.exampleArticleIds ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          apiKeyHash,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppIdConflictError(profile.appId);
      }
      throw error;
    }
  }

  async findById(appId: string): Promise<StoredAppProfile | null> {
    const row = await this.prisma.app.findUnique({ where: { id: appId } });
    return row ? { profile: toProfile(row), apiKeyHash: row.apiKeyHash } : null;
  }

  async list(): Promise<AppProfile[]> {
    const rows = await this.prisma.app.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toProfile);
  }
}
