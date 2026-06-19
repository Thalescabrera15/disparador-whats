import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ChipsModule } from './chips/chips.module';
import { validateEnv } from './config/env.validation';
import { ConversationModule } from './conversation/conversation.module';
import { DispatchesModule } from './dispatches/dispatches.module';
import { FlowsModule } from './flows/flows.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProxiesModule } from './proxies/proxies.module';
import { RedisModule } from './redis/redis.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SuppressionModule } from './suppression/suppression.module';

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
    ProxiesModule,
    ChipsModule,
    FlowsModule,
    LeadsModule,
    DispatchesModule,
    SchedulerModule,
    AiModule,
    SuppressionModule,
    ConversationModule,
    // Proximas fases: HealthMonitorModule, BridgeModule.
  ],
})
export class AppModule {}
