import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EmailConflictError,
  StoredUser,
  UserRepository,
} from './user-repository.port.js';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(email: string, passwordHash: string): Promise<StoredUser> {
    try {
      const row = await this.prisma.user.create({
        data: { email, passwordHash },
      });
      return { id: row.id, email: row.email, passwordHash: row.passwordHash };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailConflictError(email);
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row
      ? { id: row.id, email: row.email, passwordHash: row.passwordHash }
      : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row
      ? { id: row.id, email: row.email, passwordHash: row.passwordHash }
      : null;
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }

  async putAppKey(userId: string, appId: string, apiKey: string): Promise<void> {
    await this.prisma.userAppKey.upsert({
      where: { userId_appId: { userId, appId } },
      create: { userId, appId, apiKey },
      update: { apiKey },
    });
  }

  async deleteAppKey(userId: string, appId: string): Promise<void> {
    await this.prisma.userAppKey.deleteMany({ where: { userId, appId } });
  }

  async listAppKeys(userId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.userAppKey.findMany({ where: { userId } });
    return Object.fromEntries(rows.map((row) => [row.appId, row.apiKey]));
  }
}
