# dispatch-engine

Motor de disparo WhatsApp (API não-oficial / Baileys). Projeto **standalone**,
100% isolado do Verttex (API oficial). Nenhuma credencial, IP, identidade ou
infra é compartilhada entre os dois.

> Especificação: [`docs/ESPEC_MOTOR_DISPARO.md`](./docs/ESPEC_MOTOR_DISPARO.md) ·
> Anti-ban + IA: [`docs/ARQUITETURA_ANTIBAN_E_IA.md`](./docs/ARQUITETURA_ANTIBAN_E_IA.md)

## Arquitetura

Monorepo pnpm com 2 processos + 1 pacote compartilhado:

| Pacote | O quê |
|---|---|
| `apps/core` | API NestJS: auth, scheduler, conversational engine, health monitor, bridge, supressão |
| `apps/session-worker` | Processos Baileys (sessões WhatsApp) coordenados por um Supervisor |
| `packages/shared` | Contratos de fila (BullMQ) e sinais de saúde entre core e worker |

Core ⇄ Worker se comunicam **somente** via Redis (BullMQ). Postgres é a fonte
de verdade (inclui o auth state das sessões — nunca só em filesystem).

## Pré-requisitos

- Node.js >= 20 (testado em 24)
- pnpm
- Postgres + Redis (instâncias **isoladas** — recomendado: Railway)

## Setup

```bash
pnpm install
cp .env.example .env          # preencha DATABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_*
pnpm --filter @dispatch/shared build   # gera os tipos compartilhados (dist)
pnpm db:generate              # prisma generate
pnpm db:migrate               # cria as tabelas (migração inicial)
pnpm db:seed                  # cria o admin a partir de ADMIN_EMAIL/ADMIN_PASSWORD
```

## Rodar

```bash
pnpm core:dev                 # API em http://localhost:3000
pnpm worker:dev               # session worker (stubs na Fase 1)
```

Sanity check:

```bash
curl http://localhost:3000/healthz                      # liveness
curl http://localhost:3000/readyz                       # checa Postgres + Redis
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'                 # -> accessToken
```

## Status (fases — ver §17 da espec)

- [x] **Fase 1 — Fundação:** monorepo, Prisma schema completo, Postgres/Redis, auth admin, health/liveness, esqueleto do worker.
- [ ] Fase 2 — Sessão Baileys (single) + auth state + proxy + pairing
- [ ] Fase 3 — Multi-sessão (worker + supervisor + reconexão + kill switch)
- [ ] Fase 4 — Leads (import CSV/XLSX + normalização + dedup + supressão + slug)
- [ ] Fase 5 — Scheduler (rampa + teto + janela + jitter)
- [ ] Fase 6 — Conversational Engine (guards + prompt por Fluxo + IA + summary)
- [ ] Fase 7 — Bridge de links
- [ ] Fase 8 — Health Monitor + kill switch
- [ ] Fase 9 — Fluxos/IA por produto
- [ ] Fase 10 — Painel + métricas
- [ ] Fase 11 — Hardening
