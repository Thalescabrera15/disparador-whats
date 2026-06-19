import { Module } from '@nestjs/common';
import { HealthConsumer } from './health.consumer';
import { HealthMonitorService } from './health-monitor.service';

@Module({
  providers: [HealthMonitorService, HealthConsumer],
  exports: [HealthMonitorService],
})
export class HealthMonitorModule {}
