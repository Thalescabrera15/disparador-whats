import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Liveness/readiness da API (NAO confundir com o Health Monitor de chips).
 * Usado por Railway/uptime checks.
 */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  readiness() {
    return this.health.readiness();
  }
}
