import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ChipsModule } from './chips/chips.module';
import { validateEnv } from './config/env.validation';
import { DispatchesModule } from './dispatches/dispatches.module';
import { FlowsModule } from './flows/flows.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProxiesModule } from './proxies/proxies.module';
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
    ProxiesModule,
    ChipsModule,
    FlowsModule,
    LeadsModule,
    DispatchesModule,
    // Proximas fases: SchedulerModule (disparo revezando chips),
    // ConversationModule + AiModule (Qwen), HealthMonitorModule, BridgeModule, SuppressionModule.
  ],
})
export class AppModule {}
