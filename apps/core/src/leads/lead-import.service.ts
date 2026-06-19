import { BadRequestException, Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { isNormalizablePhone, normalizeE164 } from '../common/phone';
import { randomSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';

interface ParsedRow {
  [key: string]: string;
}

export interface ImportResult {
  batchId: string;
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  suppressed: number;
  inserted: number;
  /** Leads pulados no insert (colisao de unique inesperada). Deve ser 0. */
  skipped: number;
}

// Reconhecimento de colunas: hints fortes (preferidos) e fracos (so exato/boundary).
const PHONE_STRONG = ['telefone', 'whatsapp', 'celular', 'phone', 'numero', 'fone'];
const PHONE_WEAK = ['tel', 'cel', 'num'];
const NAME_HINTS = ['nome', 'name', 'contato', 'cliente'];

const DB_PARAM_CHUNK = 5000; // bem abaixo do limite de 65535 params do Postgres

function normKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

@Injectable()
export class LeadImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import(
    flowId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    source?: string,
  ): Promise<ImportResult> {
    await this.assertFlow(flowId);

    const rows = this.parseFile(file);
    if (rows.length === 0) {
      throw new BadRequestException('arquivo vazio ou sem linhas de dados');
    }

    const { phoneKey, nameKey } = this.detectColumns(rows);
    if (!phoneKey) {
      throw new BadRequestException(
        'nao encontrei a coluna de telefone (ex: telefone, phone, numero, whatsapp)',
      );
    }

    const total = rows.length;
    let invalid = 0;

    // 1) normaliza + separa meta; descarta invalidos
    type Clean = { phone: string; name: string | null; meta: Record<string, string> };
    const cleaned: Clean[] = [];
    for (const row of rows) {
      let phone: string;
      try {
        phone = normalizeE164(row[phoneKey]);
      } catch {
        invalid++;
        continue;
      }
      const name = nameKey ? row[nameKey]?.trim() || null : null;
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === phoneKey || k === nameKey) continue;
        if (v !== undefined && v !== '') meta[k] = v;
      }
      cleaned.push({ phone, name, meta });
    }

    // 2) dedup dentro do arquivo (mantem o primeiro)
    const seen = new Set<string>();
    const inFileDeduped: Clean[] = [];
    let inFileDups = 0;
    for (const c of cleaned) {
      if (seen.has(c.phone)) {
        inFileDups++;
        continue;
      }
      seen.add(c.phone);
      inFileDeduped.push(c);
    }

    const phones = inFileDeduped.map((c) => c.phone);

    // 3+4) dedup contra o fluxo + cruza supressao global (em chunks p/ nao
    // estourar o limite de parametros do Postgres em arquivos grandes)
    const existingSet = await this.collectPhones(
      phones,
      (batch) =>
        this.prisma.lead.findMany({
          where: { flowId, phone: { in: batch } },
          select: { phone: true },
        }),
    );
    const suppressedSet = await this.collectPhones(phones, (batch) =>
      this.prisma.suppression.findMany({
        where: { phone: { in: batch } },
        select: { phone: true },
      }),
    );

    // 5) contadores (independentes do dedup) + lote a inserir
    const suppressed = phones.filter((p) => suppressedSet.has(p)).length;
    let duplicates = inFileDups;
    const novos: Clean[] = [];
    for (const c of inFileDeduped) {
      if (existingSet.has(c.phone)) {
        duplicates++;
        continue;
      }
      novos.push(c);
    }
    const valid = total - invalid;

    // 6) batch + insert em chunks, tudo numa transacao (atomico)
    let insertedCount = 0;
    const batch = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.importBatch.create({
          data: {
            flowId,
            filename: file.originalname,
            totalRows: total,
            validRows: valid,
            duplicates,
            invalid,
          },
        });
        const toInsert: Prisma.LeadCreateManyInput[] = novos.map((c) => {
          const isSup = suppressedSet.has(c.phone);
          return {
            flowId,
            importBatchId: created.id,
            phone: c.phone,
            name: c.name,
            meta: c.meta as Prisma.InputJsonValue,
            source: source ?? file.originalname,
            slug: randomSlug(12),
            suppressed: isSup,
            status: isSup ? LeadStatus.SUPPRESSED : LeadStatus.PENDING,
          };
        });
        for (const part of chunk(toInsert, DB_PARAM_CHUNK)) {
          const r = await tx.lead.createMany({ data: part, skipDuplicates: true });
          insertedCount += r.count;
        }
        return created;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    const skipped = novos.length - insertedCount;

    return {
      batchId: batch.id,
      total,
      valid,
      duplicates,
      invalid,
      suppressed,
      inserted: insertedCount,
      skipped,
    };
  }

  /** Roda um findMany por chunk de phones e junta os resultados num Set. */
  private async collectPhones(
    phones: string[],
    query: (batch: string[]) => Promise<{ phone: string }[]>,
  ): Promise<Set<string>> {
    const set = new Set<string>();
    for (const part of chunk(phones, DB_PARAM_CHUNK)) {
      const rows = await query(part);
      for (const r of rows) set.add(r.phone);
    }
    return set;
  }

  // ---------------- parsing ----------------

  private parseFile(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  }): ParsedRow[] {
    const name = file.originalname.toLowerCase();
    const isCsv =
      name.endsWith('.csv') ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv';
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');

    if (isCsv) return this.parseCsv(file.buffer);
    if (isXlsx) {
      if (!this.looksLikeSpreadsheet(file.buffer)) {
        throw new BadRequestException(
          'arquivo nao parece uma planilha valida (assinatura invalida)',
        );
      }
      return this.parseXlsx(file.buffer);
    }
    // SEM fallback: tipo desconhecido nao vai para o parser binario (anti-CVE).
    throw new BadRequestException('formato nao suportado: envie .csv ou .xlsx');
  }

  /** Valida a assinatura: XLSX = ZIP (PK\x03\x04); XLS legado = OLE/CFBF. */
  private looksLikeSpreadsheet(buf: Buffer): boolean {
    if (buf.length < 4) return false;
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
    const isCfbf =
      buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
    return isZip || isCfbf;
  }

  private parseCsv(buffer: Buffer): ParsedRow[] {
    const text = buffer.toString('utf8');
    const result = Papa.parse<ParsedRow>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    return (result.data ?? []).filter((r) => r && typeof r === 'object');
  }

  private parseXlsx(buffer: Buffer): ParsedRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    // raw:true -> valor cru (numero/texto). Evita telefone-numero virar
    // notacao cientifica; <=15 digitos cabe no inteiro seguro do JS.
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    return raw.map((row) => {
      const out: ParsedRow = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v === null || v === undefined ? '' : String(v);
      }
      return out;
    });
  }

  // ---------------- deteccao de coluna ----------------

  private detectColumns(rows: ParsedRow[]): {
    phoneKey?: string;
    nameKey?: string;
  } {
    const keys = Object.keys(rows[0]);

    // candidatos de telefone, do mais forte ao mais fraco, validando por amostra
    const ranked = this.rankPhoneCandidates(keys);
    let phoneKey: string | undefined;
    for (const k of ranked) {
      if (this.columnLooksLikePhone(rows, k)) {
        phoneKey = k;
        break;
      }
    }
    if (!phoneKey && ranked.length) phoneKey = ranked[0]; // melhor nome, sem validar

    let nameKey: string | undefined;
    for (const key of keys) {
      const nk = normKey(key);
      if (NAME_HINTS.some((h) => nk === h)) {
        nameKey = key;
        break;
      }
    }
    if (!nameKey) {
      for (const key of keys) {
        const nk = normKey(key);
        if (key !== phoneKey && NAME_HINTS.some((h) => nk.includes(h))) {
          nameKey = key;
          break;
        }
      }
    }
    return { phoneKey, nameKey };
  }

  /** Ordena colunas candidatas a telefone: match exato forte > exato fraco > includes forte. */
  private rankPhoneCandidates(keys: string[]): string[] {
    const score = (key: string): number => {
      const nk = normKey(key);
      if (PHONE_STRONG.includes(nk)) return 4;
      if (PHONE_WEAK.includes(nk)) return 3;
      if (PHONE_STRONG.some((h) => nk.includes(h))) return 2;
      // hints fracos so com boundary (evita 'cancelamento' casar com 'cel')
      if (PHONE_WEAK.some((h) => new RegExp(`(^|[_\\s-])${h}([_\\s-]|$)`).test(nk))) {
        return 1;
      }
      return 0;
    };
    return keys
      .map((k) => ({ k, s: score(k) }))
      .filter((c) => c.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((c) => c.k);
  }

  /** Amostra ate 30 linhas: >=50% normalizaveis => e coluna de telefone. */
  private columnLooksLikePhone(rows: ParsedRow[], key: string): boolean {
    const sample = rows.slice(0, 30).map((r) => r[key]).filter((v) => v && v !== '');
    if (sample.length === 0) return false;
    const ok = sample.filter((v) => isNormalizablePhone(v)).length;
    return ok / sample.length >= 0.5;
  }

  private async assertFlow(flowId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { id: true },
    });
    if (!flow) throw new BadRequestException('fluxo nao encontrado');
  }
}
