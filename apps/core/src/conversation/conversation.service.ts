import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { InboundEvent, OutboundJob } from '@dispatch/shared';
import { AiService } from '../ai/ai.service';
import { detectInjection } from '../ai/guards/input-guard';
import { runOutputGuard } from '../ai/guards/output-guard';
import {
  asGuardRules,
  asLinkRule,
  buildMessages,
  type FlowAiConfig,
  type TurnRef,
} from '../ai/prompt-builder';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_OUTBOUND } from '../redis/redis.tokens';
import { SuppressionService } from '../suppression/suppression.service';
import { splitMessage, typingDelays } from './humanize';

interface LeadRef {
  id: string;
  phone: string;
  name: string | null;
  slug: string;
  meta?: unknown;
}

interface ConvRef {
  id?: string;
  summary?: string | null;
  linkSent: boolean;
  leadId: string;
  lead: LeadRef;
}

interface TurnContext {
  flow: FlowAiConfig & {
    id: string;
    bridgeDomain?: string;
    checkoutBaseUrl?: string;
  };
  conversation: ConvRef;
  history: TurnRef[];
  incoming: string;
  chipId?: string;
  inboundWaMessageId?: string;
  persist: boolean;
}

/** Variantes BR do telefone (com e sem o 9º dígito) — o JID do WhatsApp varia. */
function brPhoneVariants(e164: string): string[] {
  const set = new Set([e164]);
  const m = e164.match(/^\+55(\d{2})(\d+)$/);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) {
      set.add(`+55${ddd}${rest.slice(1)}`); // remove o 9
    } else if (rest.length === 8) {
      set.add(`+55${ddd}9${rest}`); // adiciona o 9
    }
  }
  return [...set];
}

export interface TurnResult {
  optOut: boolean;
  handoff: boolean;
  reply: string | null;
  parts: string[];
  typingDelaysMs: number[];
  linkAllowed: boolean;
  linkReleased: boolean;
  guards: string[];
  adapter: string | null;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly recentTurns: number;
  private readonly summaryEvery: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly suppression: SuppressionService,
    config: ConfigService,
    @Inject(QUEUE_OUTBOUND) private readonly outbound: Queue<OutboundJob>,
  ) {
    this.recentTurns = config.get<number>('AI_RECENT_TURNS', 10);
    this.summaryEvery = config.get<number>('AI_SUMMARY_EVERY', 8);
  }

  // ---------------- entrada real (consumer da fila INBOUND) ----------------

  async handleInbound(event: InboundEvent): Promise<void> {
    const fromE164 = `+${event.from.replace(/\D/g, '')}`;
    const variants = brPhoneVariants(fromE164);

    // idempotência: mesma mensagem (redelivery/retry) não reprocessa
    if (event.waMessageId) {
      const dup = await this.prisma.message.findFirst({
        where: { waMessageId: event.waMessageId, direction: 'IN' },
        select: { id: true },
      });
      if (dup) {
        this.logger.debug(`inbound ${event.waMessageId} já processado; no-op`);
        return;
      }
    }

    if (await this.anySuppressed(variants)) return;

    // conversa: preferir a que ESTE chip falou; senão a mais recente do lead
    let conv = (
      await this.prisma.message.findFirst({
        where: {
          chipId: event.chipId,
          direction: 'OUT',
          conversation: { lead: { phone: { in: variants } } },
        },
        orderBy: { createdAt: 'desc' },
        include: { conversation: { include: { lead: true, flow: true } } },
      })
    )?.conversation;

    if (!conv) {
      conv = await this.prisma.conversation.findFirst({
        where: { lead: { phone: { in: variants } } },
        orderBy: { updatedAt: 'desc' },
        include: { lead: true, flow: true },
      });
      if (conv) {
        this.logger.warn(
          `inbound de ${fromE164} sem OUT no chip ${event.chipId}; usando conversa ${conv.id}`,
        );
      }
    }
    if (!conv) {
      this.logger.debug(`inbound de ${fromE164} sem conversa conhecida; ignorado`);
      return;
    }

    const msgs = await this.prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
      select: { direction: true, content: true },
    });

    await this.processTurn({
      flow: conv.flow as TurnContext['flow'],
      conversation: {
        id: conv.id,
        summary: conv.summary,
        linkSent: conv.linkSent,
        leadId: conv.leadId,
        lead: conv.lead,
      },
      history: msgs.map((m) => ({ direction: m.direction, content: m.content })),
      incoming: event.content,
      chipId: event.chipId,
      inboundWaMessageId: event.waMessageId,
      persist: true,
    });
  }

  private async anySuppressed(phones: string[]): Promise<boolean> {
    const s = await this.prisma.suppression.findFirst({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    return !!s;
  }

  // ---------------- dry-run (testar sem enviar/gravar) ----------------

  async preview(
    flowId: string,
    dto: { incoming: string; leadId?: string; history?: TurnRef[] },
  ): Promise<TurnResult> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    if (!flow) throw new BadRequestException('fluxo nao encontrado');

    let lead: LeadRef | null = null;
    let conv: { id: string; summary: string | null; linkSent: boolean } | null =
      null;
    let history: TurnRef[] = (dto.history ?? []).map((h) => ({
      direction: h?.direction === 'OUT' ? 'OUT' : 'IN',
      content: String(h?.content ?? ''),
    }));

    if (dto.leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
      if (l) {
        lead = l;
        conv = await this.prisma.conversation.findUnique({
          where: { leadId: dto.leadId },
          select: { id: true, summary: true, linkSent: true },
        });
        if (conv) {
          const msgs = await this.prisma.message.findMany({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'asc' },
            select: { direction: true, content: true },
          });
          history = msgs.map((m) => ({
            direction: m.direction,
            content: m.content,
          }));
        }
      }
    }

    const effLead: LeadRef = lead ?? {
      id: 'preview',
      phone: '+5511999999999',
      name: 'Maria',
      slug: 'preview',
      meta: {},
    };

    return this.processTurn({
      flow: flow as TurnContext['flow'],
      conversation: {
        id: conv?.id,
        summary: conv?.summary ?? null,
        linkSent: conv?.linkSent ?? false,
        leadId: effLead.id,
        lead: effLead,
      },
      history,
      incoming: dto.incoming,
      persist: false,
    });
  }

  // ---------------- núcleo ----------------

  async processTurn(ctx: TurnContext): Promise<TurnResult> {
    const empty: TurnResult = {
      optOut: false,
      handoff: false,
      reply: null,
      parts: [],
      typingDelaysMs: [],
      linkAllowed: false,
      linkReleased: false,
      guards: [],
      adapter: null,
    };

    // 1) OPT-OUT (antes da IA): supressão imediata
    if (this.suppression.isOptOut(ctx.incoming)) {
      if (ctx.persist) {
        await this.recordInbound(ctx);
        await this.suppression.suppress(ctx.conversation.lead.phone);
        if (ctx.conversation.id) {
          await this.prisma.conversation.update({
            where: { id: ctx.conversation.id },
            data: { state: 'CLOSED' },
          });
        }
      }
      return { ...empty, optOut: true, guards: ['opt_out'] };
    }

    const guards: string[] = [];
    if (detectInjection(ctx.incoming)) guards.push('injection_ignored');

    // 2) HANDOFF: lead pede humano
    if (this.isHandoffRequest(ctx.incoming)) {
      const reply = 'Claro! Vou te transferir para um atendente, só um instante.';
      const parts = [reply];
      const delays = typingDelays(parts);
      if (ctx.persist) {
        await this.recordInbound(ctx);
        await this.markHandoff(ctx);
        await this.recordAndEnqueueOut(ctx, parts, delays, false);
      }
      return {
        ...empty,
        handoff: true,
        reply,
        parts,
        typingDelaysMs: delays,
        guards: [...guards, 'handoff'],
      };
    }

    // 3) LINK GATE (determinístico, no código)
    const linkAllowed = this.shouldReleaseLink(ctx);

    // 4) geração com loop de guard (regenera/fallback)
    const gen = await this.generateGuarded(ctx, linkAllowed, guards);
    let reply = gen.text;

    // 5) LINK RELEASE (injetado pelo código, nunca pela IA)
    let linkReleased = false;
    if (linkAllowed && !ctx.conversation.linkSent) {
      const link = this.buildLink(ctx);
      if (link) {
        reply = reply ? `${reply}\n\n${link}` : link;
        linkReleased = true;
      }
    }

    // 6) humanização
    const parts = splitMessage(reply);
    const delays = typingDelays(parts);

    if (ctx.persist) {
      await this.recordInbound(ctx);
      await this.recordAndEnqueueOut(ctx, parts, delays, linkReleased);
      await this.afterTurn(ctx, linkReleased);
    }

    return {
      ...empty,
      reply,
      parts,
      typingDelaysMs: delays,
      linkAllowed,
      linkReleased,
      guards,
      adapter: gen.adapter,
    };
  }

  private async generateGuarded(
    ctx: TurnContext,
    linkAllowed: boolean,
    guards: string[],
  ): Promise<{ text: string; adapter: string }> {
    const rules = asGuardRules(ctx.flow.guardRules);
    const maxChars = rules.maxChars ?? 600;
    const forbidden = rules.forbidden ?? [];
    const recentBot = ctx.history
      .filter((h) => h.direction === 'OUT')
      .map((h) => h.content)
      .slice(-3);

    const base = buildMessages({
      flow: ctx.flow,
      summary: ctx.conversation.summary,
      history: ctx.history,
      incoming: ctx.incoming,
      linkAllowed,
      recentTurns: this.recentTurns,
    });

    let adapter = 'stub';
    let gotResponse = false;
    let lastErr: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const messages =
        attempt === 0
          ? base
          : [
              ...base,
              {
                role: 'system' as const,
                content:
                  'Sua última resposta foi rejeitada (link, repetição ou promessa exagerada). Reescreva DIFERENTE, curta, sem link e sem repetir frases.',
              },
            ];
      try {
        const out = await this.ai.generate(ctx.flow.aiModel, messages);
        adapter = out.adapter;
        gotResponse = true;
        const g = runOutputGuard({ raw: out.text, maxChars, forbidden, recentBot });
        g.triggered.forEach((t) => guards.push(t));
        if (g.ok) return { text: g.text, adapter };
        // stub é determinístico: regenerar daria o mesmo -> vai pro fallback
        if (adapter === 'stub') break;
      } catch (err) {
        lastErr = err;
        guards.push('llm_error');
      }
    }

    // LLM totalmente indisponível: deixa o job da fila INBOUND re-tentar
    if (!gotResponse && lastErr) throw lastErr;
    // respondeu mas sem passar nos guards -> fallback seguro (nunca enviar lixo)
    guards.push('fallback');
    return { text: 'Posso te ajudar com mais alguma dúvida?', adapter };
  }

  private shouldReleaseLink(ctx: TurnContext): boolean {
    const rule = asLinkRule(ctx.flow.linkReleaseRule);
    const inboundCount =
      ctx.history.filter((h) => h.direction === 'IN').length + 1; // + atual
    if (inboundCount < (rule.minInboundTurns ?? 2)) return false;
    const t = norm(ctx.incoming);
    return (rule.intentKeywords ?? []).some((k) => t.includes(norm(k)));
  }

  private buildLink(ctx: TurnContext): string | null {
    // Fase 7 (bridge) troca por link rastreável com slug único.
    if (ctx.flow.bridgeDomain && ctx.conversation.lead.slug) {
      return `https://${ctx.flow.bridgeDomain}/r/${ctx.conversation.lead.slug}`;
    }
    if (ctx.flow.checkoutBaseUrl) return ctx.flow.checkoutBaseUrl;
    return null;
  }

  private isHandoffRequest(text: string): boolean {
    const t = norm(text);
    return /(atendente|falar com (um |uma )?(humano|pessoa|alguem)|pessoa de verdade)/.test(
      t,
    );
  }

  // ---------------- persistência ----------------

  private async recordInbound(ctx: TurnContext): Promise<void> {
    if (!ctx.conversation.id) return;
    await this.prisma.message.create({
      data: {
        conversationId: ctx.conversation.id,
        chipId: ctx.chipId ?? null,
        direction: 'IN',
        type: 'TEXT',
        content: ctx.incoming,
        waMessageId: ctx.inboundWaMessageId ?? null,
      },
    });
  }

  private async recordAndEnqueueOut(
    ctx: TurnContext,
    parts: string[],
    delays: number[],
    linkReleased: boolean,
  ): Promise<void> {
    if (!ctx.conversation.id || !ctx.chipId) return;
    for (const part of parts) {
      await this.prisma.message.create({
        data: {
          conversationId: ctx.conversation.id,
          chipId: ctx.chipId,
          direction: 'OUT',
          type: 'TEXT',
          content: part,
        },
      });
    }
    await this.outbound.add('reply', {
      conversationId: ctx.conversation.id,
      leadId: ctx.conversation.leadId,
      chipId: ctx.chipId,
      to: ctx.conversation.lead.phone,
      type: 'TEXT',
      parts,
      typingDelaysMs: delays,
    });
    if (linkReleased) {
      await this.prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { linkSent: true, state: 'LINK_RELEASED' },
      });
    }
  }

  private async markHandoff(ctx: TurnContext): Promise<void> {
    if (!ctx.conversation.id) return;
    await this.prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: { handoff: true, state: 'HANDOFF' },
    });
    this.logger.warn(`handoff: conversa ${ctx.conversation.id} escalada p/ humano`);
  }

  private async afterTurn(ctx: TurnContext, linkReleased: boolean): Promise<void> {
    if (!ctx.conversation.id) return;
    if (!linkReleased) {
      await this.prisma.conversation.update({
        where: { id: ctx.conversation.id },
        data: { state: 'ACTIVE' },
      });
    }
    await this.prisma.lead.updateMany({
      where: { id: ctx.conversation.leadId, status: { in: ['OPENED', 'QUEUED'] } },
      data: { status: 'CONVERSING' },
    });
    await this.rollSummary(ctx);
  }

  /** Sumarização rolante: condensa o histórico a cada N trocas (controle de contexto). */
  private async rollSummary(ctx: TurnContext): Promise<void> {
    if (!ctx.conversation.id) return;
    const turns = ctx.history.length + 2; // +inbound +outbound deste turno
    if (turns % this.summaryEvery !== 0) return;
    try {
      const recent = ctx.history
        .slice(-this.summaryEvery)
        .map((h) => `${h.direction === 'IN' ? 'Lead' : 'Vendedor'}: ${h.content}`)
        .join('\n');
      const out = await this.ai.generate(ctx.flow.aiModel, [
        {
          role: 'system',
          content:
            'Resuma a conversa abaixo em 2-3 linhas, preservando: interesse do lead, objeções já tratadas e se o link já foi enviado. Só o resumo.',
        },
        { role: 'user', content: recent },
      ]);
      if (out.text.trim()) {
        await this.prisma.conversation.update({
          where: { id: ctx.conversation.id },
          data: { summary: out.text.trim() },
        });
      }
    } catch (err) {
      this.logger.warn(`rollSummary falhou: ${(err as Error).message}`);
    }
  }
}
