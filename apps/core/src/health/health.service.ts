import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CONNECTION } from '../redis/redis.tokens';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  async readiness() {
    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const status = postgres && redis ? 'ok' : 'degraded';
    return { status, postgres, redis };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
