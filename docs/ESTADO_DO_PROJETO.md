# dispatch-engine — Estado do Projeto & Capacidades

> Documento vivo. Atualizar a cada fase concluída.
> Última atualização: 2026-06-18.

---

## 1. O que o sistema deve ser capaz de fazer (visão)

Um motor de disparo + atendimento por WhatsApp (API **não-oficial**, Baileys), pensado
para **base morna** e operação com **esteira de vários números revezando**, com
sobrevivência de chip (anti-ban) como prioridade.

Capacidades-alvo:

1. **Conectar N WhatsApps** já ativos (companion: QR ou pairing code), com **auth state
   persistido no Postgres** e **proxy estável por número**.
2. **Esteira de números nomeados** — cada chip tem um nome (`label`); você seleciona
   quantos e **quais** participam de cada disparo, e vê **insights por número** (status,
   rampa, capacidade, saúde, taxa de resposta).
3. **Importar a lista de leads** (CSV **e** XLSX), com normalização E.164, dedup,
   cruzamento com supressão e colunas extras viram variáveis.
4. **Templates de abertura variados** com **variáveis** (`{nome}`, `{primeiro_nome}`,
   custom como `{cidade}`/`{valor}`, constantes de campanha, fallback `{x|padrão}`),
   **sem link** na abertura por padrão.
5. **Disparar revezando os números selecionados**, cada um respeitando **rampa, teto
   diário, janela comercial, jitter e saúde**, com **digitação simulada**.
6. **IA conversacional** (Qwen3 sem censura via API OpenAI-compatível) responde o inbound,
   conduz a conversa e libera o **link único por lead** conforme a regra do fluxo.
7. **Anti-ban em camadas**: rampa de aquecimento, teto/janela/jitter, opt-out global,
   health monitor + kill switch por chip, isolamento total da infra oficial (Verttex).

### O que o sistema NÃO faz (não-objetivos)

- **NÃO registra número novo "phoneless"** (criar conta só com SMS, sem celular). Validado
  como **inviável** (ver `docs/` e a decisão de projeto): Baileys é companion-only, a Meta
  bloqueia registro não-oficial (device integrity), e não há lib confiável. **Os números são
  ativados externamente** (app oficial em celular/emulador) e o sistema os conecta como
  companion.
- Não é ferramenta de cold-blast para lista comprada/raspada — é desenhado para base morna.

---

## 2. Arquitetura

Monorepo **pnpm**, isolado da infra oficial (projeto Railway próprio `dispatch-engine`).

```
apps/core            NestJS: API, auth, flows, leads, chips, proxies, dispatches,
                     (futuro) scheduler, conversational engine, health, bridge
apps/session-worker  Processo Baileys: Supervisor + sessões (1 número = 1 sessão = 1 proxy)
packages/shared      Contratos de fila (BullMQ) e sinais de saúde entre core e worker
prisma/              Schema + migrações (Postgres isolado no Railway)
```

- **Core ⇄ Worker** se comunicam **somente via Redis (BullMQ)**: filas `openings`,
  `outbound`, `inbound`, `health`, `control`.
- **Postgres** é a fonte de verdade (inclui o **auth state** das sessões).
- Stack: NestJS, Prisma, PostgreSQL, BullMQ/Redis, Baileys 7, JWT (admin), zod (env).

---

## 3. Estado atual (por fase)

### ✅ Fase 1 — Fundação
Monorepo, Prisma schema completo, Postgres/Redis (Railway), **auth admin (JWT)**,
health/liveness (`/healthz`, `/readyz`), esqueleto do worker. Validado ponta a ponta.

### ✅ Fase 2 — Sessão Baileys
- `BaileysSession` real: connect, **QR e pairing code**, reconexão com backoff +
  teardown/reentrância, `markOnlineOnConnect:false`.
- **Auth state no Postgres** (`postgres-auth-state.ts`) com serialização `BufferJSON` e
  write-coalescing resiliente (try/finally + flush); wipe no `loggedOut`.
- **Proxy estável** ligado **antes** do connect (http/socks), validação de região;
  worker **recusa conectar sem proxy** (anti-ban) salvo `ALLOW_PAIR_WITHOUT_PROXY`.
- Canal de **controle** core↔worker (PAIR/START/STOP/RETIRE); QR/status publicados no Redis.
- Core: `ChipsModule` (`/chips`, `pair`, `bind-proxy`, `rename`, `insights`, `health`,
  start/pause/retire) + `ProxiesModule`. Tudo sob guard de admin.

### ✅ Fase 4 — Leads
Import CSV/XLSX (`POST /flows/:id/leads/import`), normalização E.164 (**libphonenumber-js**),
dedup (arquivo + fluxo), cruza supressão, slug por lead, `ImportBatch`, chunking + transação,
contadores auditáveis. Upload com fileFilter + validação de assinatura (anti-CVE; xlsx 0.20.3).

### 🟡 Fase 5 — Disparo (em andamento)
- **`Dispatch`** = rodada de campanha: nº **variável** de chips **selecionados pelo nome**,
  status DRAFT/RUNNING/PAUSED/DONE, **`allowLinkInOpening` por disparo** (default false).
- **Templates** (`OpeningMessage`) CRUD + bloqueio de link cru + **motor de variáveis**
  (`{nome}`, custom, constantes `flow.variables`, fallback) + **preview** contra lead real.
- **Insights por número** (nome/status/rampa/cap/saúde/taxa de resposta).
- ⏳ **Falta: o motor de revezamento (scheduler)** que consome disparos RUNNING, escolhe
  chip com capacidade livre, sorteia template, renderiza, aplica jitter/digitação e enfileira.

### ⏳ Próximas
- Fase 3 — Multi-sessão (recuperação de sessões no boot, rebalanceamento entre workers).
- Fase 6 — Conversational Engine + IA (Qwen) respondendo o inbound + guards + summary.
- Fase 7 — Bridge de links (domínio-ponte, slug, redirect 302, tracking).
- Fase 8 — Health Monitor + kill switch (score, políticas automáticas).
- Fase 10 — Painel (Next.js) + métricas.
- Fase 11 — Hardening (observabilidade, backups, testes de carga).

---

## 4. Decisões-chave

- **Registro phoneless = NO-GO** (inviável 2025-2026). Arquitetura assume companion +
  ativação externa do número. (Validado por pesquisa multi-agente + checagem de código.)
- **Política de link decidida por disparo** (`allowLinkInOpening`), default anti-ban (sem
  link na abertura; link só na resposta).
- **IA = Qwen3 sem censura** via adapter OpenAI-compatível (`QWEN_BASE_URL`/`QWEN_API_KEY`/
  `QWEN_MODEL`).
- **Bancos no Railway**, projeto dedicado isolado do Verttex.

---

## 5. Modelo de dados (resumo)

`Flow` (campanha: persona/knowledge/IA + `variables` de template) · `OpeningMessage`
(aberturas variadas) · `Dispatch` (rodada: chips selecionados + `allowLinkInOpening`) ·
`WhatsappNumber` (chip: authState, proxy, rampDay/dailyCap/sentToday, healthScore, janela) ·
`Proxy` · `Lead` (E.164, meta, warmth, status, slug) · `ImportBatch` · `Conversation` ·
`Message` · `TrackedLink` · `HealthEvent` · `Suppression` (opt-out global) · `AdminUser`.

---

## 6. Mapa de endpoints (core)

```
POST /auth/login · GET /auth/me · GET /healthz · GET /readyz
GET/POST /flows · GET/PATCH /flows/:id
POST/GET /flows/:id/opening-messages · PATCH/DELETE :id · POST .../preview
POST /flows/:id/leads/import · GET /flows/:id/leads · GET .../leads/stats
POST/GET /chips · GET /chips/insights · GET /chips/:id · PATCH /chips/:id/rename
POST /chips/:id/pair · GET /chips/:id/pair · POST /chips/:id/{start,pause,retire}
POST /chips/:id/bind-proxy · GET /chips/:id/health
GET/POST /proxies
POST/GET /flows/:id/dispatches · GET /dispatches/:id · PATCH /dispatches/:id
PATCH /dispatches/:id/{chips,status} · POST/DELETE /dispatches/:id/chips[/:chipId]
```

---

## 7. Anti-ban embutido (princípios)

1 IP estável por número · região casada · auth persistido (minimizar re-login) · rampa
de aquecimento · teto diário + janela comercial + jitter + variância por chip · base morna ·
abertura sem link (link só após resposta) · variação real de texto · opt-out instantâneo ·
health monitor + kill switch isolado por chip · isolamento total do Verttex.

---

## 8. Como rodar (dev)

```bash
pnpm install
cp .env.example .env           # DATABASE_URL/REDIS_URL (Railway), JWT_SECRET, ADMIN_*
pnpm --filter @dispatch/shared build
pnpm db:migrate && pnpm db:seed
pnpm core:dev                  # http://localhost:3000
pnpm worker:dev                # sessões Baileys
```

> Qualidade: a Fase 2 + Fase 4 passaram por **revisão adversarial multi-agente** (22
> achados reais corrigidos antes de seguir para o disparo).
