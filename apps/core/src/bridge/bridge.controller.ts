import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BridgeService } from './bridge.service';

/** Redirect público do bridge. SEM auth (é o link que o lead clica). */
@Controller('r')
export class BridgeController {
  constructor(private readonly bridge: BridgeService) {}

  @Get(':slug')
  async redirect(@Param('slug') slug: string, @Res() res: Response) {
    try {
      const target = await this.bridge.resolveAndClick(slug);
      return res.redirect(302, target);
    } catch {
      // slug inválido: não vaza erro; manda pra uma página neutra (raiz)
      return res.redirect(302, '/');
    }
  }
}
