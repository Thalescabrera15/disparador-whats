import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bridge de links (anti-ban):
 * - link disparado = domínio-ponte de marketing + slug ÚNICO por lead (/r/{slug})
 * - o checkout (domínio de pagamento) NUNCA é o link compartilhado, é só o destino do 302
 * - registra clique p/ tracking
 */
@Injectable()
export class BridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Cria (idempotente) o TrackedLink do lead e retorna a URL-ponte /r/{slug}. */
  async getOrCreateTrackedLink(
    leadId: string,
    flowId: string,
  ): Promise<string | null> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { flow: { select: { bridgeDomain: true, checkoutBaseUrl: true } } },
    });
    if (!lead) return null;

    const bridge = this.bridgeBase(lead.flow.bridgeDomain);
    // sem domínio-ponte nem base pública: cai no checkout direto (degradado)
    if (!bridge) return lead.flow.checkoutBaseUrl || null;

    const targetUrl = this.buildCheckoutUrl(lead.flow.checkoutBaseUrl, lead.slug);

    await this.prisma.trackedLink.upsert({
      where: { slug: lead.slug },
      update: { targetUrl },
      create: { leadId, flowId, slug: lead.slug, targetUrl },
    });

    return `${bridge}/r/${lead.slug}`;
  }

  /** URL-ponte para PREVIEW (dry-run): NÃO grava nada. */
  previewUrl(
    flow: { bridgeDomain?: string; checkoutBaseUrl?: string },
    slug: string,
  ): string | null {
    const bridge = this.bridgeBase(flow.bridgeDomain);
    if (!bridge) return flow.checkoutBaseUrl || null;
    return `${bridge}/r/${slug}`;
  }

  /** Resolve o slug, registra o clique e devolve o destino (checkout). */
  async resolveAndClick(slug: string): Promise<string> {
    const link = await this.prisma.trackedLink.findUnique({ where: { slug } });
    if (!link) throw new NotFoundException('link nao encontrado');
    await this.prisma.trackedLink.update({
      where: { slug },
      data: {
        clicks: { increment: 1 },
        firstClick: link.firstClick ?? new Date(),
      },
    });
    return link.targetUrl;
  }

  private buildCheckoutUrl(checkoutBaseUrl: string, slug: string): string {
    if (!checkoutBaseUrl) return '';
    // anexa ref p/ rastreabilidade no checkout (SMPay)
    const sep = checkoutBaseUrl.includes('?') ? '&' : '?';
    return `${checkoutBaseUrl}${sep}ref=${encodeURIComponent(slug)}`;
  }

  /** Base do domínio-ponte: flow.bridgeDomain > PUBLIC_BASE_URL > null. */
  private bridgeBase(bridgeDomain?: string): string | null {
    if (bridgeDomain?.trim()) {
      const d = bridgeDomain.trim().replace(/\/$/, '');
      return /^https?:\/\//.test(d) ? d : `https://${d}`;
    }
    const pub = this.config.get<string>('PUBLIC_BASE_URL', '').trim();
    return pub ? pub.replace(/\/$/, '') : null;
  }
}
