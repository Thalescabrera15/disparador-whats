import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthMonitorService } from './health-monitor.service';

/**
 * Varredura periodica de mensagens OUT sem entrega/read e taxa de resposta por chip.
 * Complementa os receipts em tempo real do Baileys (worker).
 */
@Injectable()
export class DeliveryMonitorService {
  private readonly logger = new Logger(DeliveryMonitorService.name);
  private readonly deliveryTimeoutMs: number;
  private readonly readTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: HealthMonitorService,
    config: ConfigService,
  ) {
    this.deliveryTimeoutMs = config.get<number>('DELIVERY_TIMEOUT_MS', 300_000);
    this.readTimeoutMs = config.get<number>('READ_TIMEOUT_MS', 3_600_000);
  }

  async sweep(): Promise<void> {
    await this.sweepNoDelivery();
    await this.sweepNoRead();
    await this.sweepReplyDrop();
  }

  private async sweepNoDelivery(): Promise<void> {
    const cutoff = new Date(Date.now() - this.deliveryTimeoutMs);
    const msgs = await this.prisma.message.findMany({
      where: {
        direction: 'OUT',
        failed: false,
        deliveredAt: null,
        waMessageId: { not: null },
        createdAt: { lt: cutoff },
      },
      select: { id: true, chipId: true },
      take: 100,
    });

    for (const m of msgs) {
      if (!m.chipId) continue;
      const updated = await this.prisma.message.updateMany({
        where: { id: m.id, deliveredAt: null, failed: false },
        data: { failed: true, failReason: 'no_delivery' },
      });
      if (updated.count === 1) {
        await this.monitor.ingestSignal(m.chipId, 'NO_DELIVERY', {
          messageId: m.id,
        });
      }
    }
    if (msgs.length) {
      this.logger.debug(`NO_DELIVERY: ${msgs.length} candidato(s)`);
    }
  }

  private async sweepNoRead(): Promise<void> {
    const cutoff = new Date(Date.now() - this.readTimeoutMs);
    const msgs = await this.prisma.message.findMany({
      where: {
        direction: 'OUT',
        failed: false,
        deliveredAt: { not: null },
        readAt: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true, chipId: true },
      take: 100,
    });

    for (const m of msgs) {
      if (!m.chipId) continue;
      const updated = await this.prisma.message.updateMany({
        where: { id: m.id, readAt: null, failed: false },
        data: { failReason: 'no_read' },
      });
      if (updated.count === 1) {
        await this.monitor.ingestSignal(m.chipId, 'NO_READ', {
          messageId: m.id,
        });
      }
    }
  }

  /** Queda brusca na taxa de resposta (proxy de block/mute). */
  private async sweepReplyDrop(): Promise<void> {
    const chips = await this.prisma.whatsappNumber.findMany({
      where: { status: { in: ['ACTIVE', 'WARMING'] } },
      select: { id: true },
    });

    const now = Date.now();
    const since24h = new Date(now - 24 * 3_600_000);
    const since7d = new Date(now - 7 * 24 * 3_600_000);

    for (const chip of chips) {
      const [recentOut, recentIn, histOut, histIn] = await Promise.all([
        this.prisma.message.count({
          where: {
            chipId: chip.id,
            direction: 'OUT',
            createdAt: { gte: since24h },
          },
        }),
        this.prisma.message.count({
          where: {
            chipId: chip.id,
            direction: 'IN',
            createdAt: { gte: since24h },
          },
        }),
        this.prisma.message.count({
          where: {
            chipId: chip.id,
            direction: 'OUT',
            createdAt: { gte: since7d, lt: since24h },
          },
        }),
        this.prisma.message.count({
          where: {
            chipId: chip.id,
            direction: 'IN',
            createdAt: { gte: since7d, lt: since24h },
          },
        }),
      ]);

      if (recentOut < 8) continue;
      const recentRate = recentIn / recentOut;
      const histRate = histOut >= 10 ? histIn / histOut : null;
      if (histRate === null || histRate < 0.05) continue;
      if (recentRate >= histRate * 0.5) continue;

      const recentSignal = await this.prisma.healthEvent.findFirst({
        where: {
          chipId: chip.id,
          kind: 'REPLY_DROP',
          createdAt: { gte: since24h },
        },
      });
      if (recentSignal) continue;

      await this.monitor.ingestSignal(chip.id, 'REPLY_DROP', {
        recentRate: +recentRate.toFixed(3),
        histRate: +histRate.toFixed(3),
        recentOut,
        recentIn,
      });
      this.logger.warn(
        `REPLY_DROP chip=${chip.id} rate ${recentRate.toFixed(2)} vs hist ${histRate.toFixed(2)}`,
      );
    }
  }
}
