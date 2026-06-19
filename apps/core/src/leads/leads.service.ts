import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  list(
    flowId: string,
    opts: { status?: LeadStatus; skip?: number; take?: number } = {},
  ) {
    return this.prisma.lead.findMany({
      where: { flowId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: opts.skip ?? 0,
      take: Math.min(opts.take ?? 50, 200),
      select: {
        id: true,
        phone: true,
        name: true,
        status: true,
        warmth: true,
        suppressed: true,
        source: true,
        createdAt: true,
      },
    });
  }

  async stats(flowId: string) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { flowId },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    ) as Record<LeadStatus, number>;
    const total = grouped.reduce((acc, g) => acc + g._count._all, 0);
    return { total, byStatus };
  }
}
