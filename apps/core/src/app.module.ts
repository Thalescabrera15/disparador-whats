import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    // Proximas fases: FlowsModule, LeadsModule, ChipsModule, ProxiesModule,
    // SchedulerModule, ConversationModule, HealthMonitorModule, BridgeModule,
    // SuppressionModule, AiModule.
  ],
})
export class AppModule {}
