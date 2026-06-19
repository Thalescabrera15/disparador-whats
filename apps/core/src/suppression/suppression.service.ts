import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { detectOptOut } from '../ai/guards/input-guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppressionService {
  private readonly keywords: string[];

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.keywords = (
      config.get<string>('OPTOUT_KEYWORDS') ??
      'descadastrar,sair,parar,pare,nao quero receber,nao quero mais,para de me mandar,pare de me mandar,para de enviar,pare de enviar,remover,cancelar,stop,unsubscribe'
    )
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }

  isOptOut(text: string): boolean {
    return detectOptOut(text, this.keywords);
  }

  /** Suprime globalmente: cria Suppression + marca o lead em todos os fluxos. */
  async suppress(phone: string, reason = 'opt-out') {
    await this.prisma.suppression.upsert({
      where: { phone },
      update: {},
      create: { phone, reason },
    });
    await this.prisma.lead.updateMany({
      where: { phone },
      data: { suppressed: true, status: 'SUPPRESSED' },
    });
    return { phone, reason };
  }

  /** Reverte uma supressão equivocada (opt-out é permanente, mas erra-se). */
  async unsuppress(phone: string) {
    await this.prisma.suppression
      .delete({ where: { phone } })
      .catch(() => undefined); // ok se não existir
    await this.prisma.lead.updateMany({
      where: { phone, suppressed: true },
      data: { suppressed: false },
    });
    await this.prisma.lead.updateMany({
      where: { phone, status: 'SUPPRESSED' },
      data: { status: 'PENDING' },
    });
    return { phone, restored: true };
  }

  async isSuppressed(phone: string): Promise<boolean> {
    const s = await this.prisma.suppression.findUnique({ where: { phone } });
    return !!s;
  }
}
