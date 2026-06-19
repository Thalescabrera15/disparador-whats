import { Controller, Get, Redirect } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Liveness/readiness da API (NAO confundir com o Health Monitor de chips).
 * Usado por Railway/uptime checks.
 */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Raiz -> painel. */
  @Get()
  @Redirect('/app', 302)
  root() {
    return;
  }

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  readiness() {
    return this.health.readiness();
  }
}
