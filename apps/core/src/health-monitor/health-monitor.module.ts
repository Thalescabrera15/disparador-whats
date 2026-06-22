import { Module } from '@nestjs/common';
import { DeliveryMonitorService } from './delivery-monitor.service';
import { HealthConsumer } from './health.consumer';
import { HealthMonitorService } from './health-monitor.service';

@Module({
  providers: [HealthMonitorService, DeliveryMonitorService, HealthConsumer],
  exports: [HealthMonitorService, DeliveryMonitorService],
})
export class HealthMonitorModule {}
