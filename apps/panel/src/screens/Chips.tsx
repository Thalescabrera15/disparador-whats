import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { Badge, Btn, Card, Err, Field, Input, useAsync } from '../ui';

type ChipRow = {
  id: string;
  label: string;
  phone: string;
  status: string;
  rampDay: number;
  dailyCap: number;
  sentToday: number;
  healthScore: number;
  responseRate: number;
  proxyId: string | null;
  windowStart: number;
  windowEnd: number;
  restDays: number[] | null;
  proxy?: { id: string; region: string; type: string; host: string } | null;
  sessionStatus: string;
  sessionUpdatedAt: number;
};

const SESSION_LABEL: Record<string, string> = {
  CONNECTED: 'Online',
  PAIRING: 'Aguardando QR',
  DISCONNECTED: 'Desconectado',
  STOPPED: 'Parado',
  INIT: 'Inativo',
};

const CHIP_STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-600',
  WARMING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PAUSED: 'bg-slate-200 text-slate-600',
  COOLDOWN: 'bg-orange-100 text-orange-800',
  RETIRED: 'bg-red-100 text-red-700',
};

const SESSION_COLOR: Record<string, string> = {
  CONNECTED: 'bg-emerald-500',
  PAIRING: 'bg-blue-500 animate-pulse',
  DISCONNECTED: 'bg-amber-500',
  STOPPED: 'bg-slate-400',
  INIT: 'bg-slate-300',
};

function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function Chips() {
  const chips = useAsync<ChipRow[]>(() => api.chipInsights(), []);
  const proxies = useAsync<any[]>(() => api.listProxies(), []);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [proxyId, setProxyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<ChipRow | null>(null);
  const [configuring, setConfiguring] = useState<ChipRow | null>(null);
  const [showProxyForm, setShowProxyForm] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(() => {
    chips.reload();
    proxies.reload();
  }, [chips, proxies]);

  useEffect(() => {
    pollRef.current = setInterval(() => chips.reload(), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chips]);

  const rows = chips.data ?? [];
  const online = rows.filter((c) => c.sessionStatus === 'CONNECTED').length;
  const pairing = rows.filter((c) => c.sessionStatus === 'PAIRING').length;

  async function create() {
    setError(null);
    if (!label.trim() || !phone.trim()) {
      setError('Preencha nome e telefone.');
      return;
    }
    try {
      const chip = await api.createChip(
        label.trim(),
        phone.trim(),
        proxyId || undefined,
      );
      setLabel('');
      setPhone('');
      setProxyId('');
      reload();
      const full = rows.find((c) => c.id === chip.id) ?? {
        ...chip,
        sessionStatus: 'INIT',
        sessionUpdatedAt: 0,
        rampDay: 0,
        dailyCap: 0,
        sentToday: 0,
        healthScore: 100,
        responseRate: 0,
        windowStart: 9,
        windowEnd: 20,
        restDays: null,
      };
      setConnecting(full as ChipRow);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function act(id: string, action: 'start' | 'pause' | 'retire') {
    if (action === 'retire' && !confirm('Aposentar este número? Não poderá ser reutilizado.')) {
      return;
    }
    await api.chipAction(id, action).catch((e) => setError(e.message));
    reload();
  }

  async function rename(id: string, current: string) {
    const name = prompt('Novo nome do número:', current);
    if (name?.trim()) {
      await api.renameChip(id, name.trim()).catch((e) => setError(e.message));
      reload();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Conectar WhatsApps</h2>
        <p className="text-sm text-slate-500 mt-1">
          Cadastre cada número, vincule um proxy estável e escaneie o QR no celular.
          O status atualiza automaticamente a cada poucos segundos.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="text-2xl font-bold text-emerald-600">{online}</div>
          <div className="text-xs text-slate-500">sessões online</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-blue-600">{pairing}</div>
          <div className="text-xs text-slate-500">aguardando pareamento</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-slate-700">{rows.length}</div>
          <div className="text-xs text-slate-500">números cadastrados</div>
        </Card>
      </div>

      <Card title="Adicionar número">
        <Err>{error}</Err>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label="Nome (apelido)">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Vendas-01"
            />
          </Field>
          <Field label="Telefone (com DDD)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11999990001"
            />
          </Field>
          <Field label="Proxy (recomendado)">
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={proxyId}
              onChange={(e) => setProxyId(e.target.value)}
            >
              <option value="">— selecionar depois —</option>
              {(proxies.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.region} · {p.type} · {p.host}
                </option>
              ))}
            </select>
          </Field>
          <Btn onClick={create} className="mb-3 h-[38px]">
            Cadastrar e conectar
          </Btn>
        </div>
      </Card>

      <Card
        title="Proxies"
        right={
          <Btn variant="ghost" onClick={() => setShowProxyForm((v) => !v)}>
            {showProxyForm ? 'cancelar' : '+ novo proxy'}
          </Btn>
        }
      >
        {showProxyForm && (
          <ProxyForm
            onCreated={() => {
              setShowProxyForm(false);
              proxies.reload();
            }}
            onError={setError}
          />
        )}
        {(proxies.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">
            Nenhum proxy cadastrado. Em produção, cada chip precisa de proxy residencial/mobile
            na mesma região do número.
          </p>
        ) : (
          <ul className="text-sm space-y-1">
            {(proxies.data ?? []).map((p) => (
              <li key={p.id} className="flex justify-between text-slate-600">
                <span>
                  <b>{p.region}</b> · {p.type} · {p.host}:{p.port}
                </span>
                <span className="text-xs text-slate-400">{p.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Números" right={<Btn variant="ghost" onClick={reload}>atualizar</Btn>}>
        {chips.loading && rows.length === 0 && (
          <p className="text-sm text-slate-400">carregando…</p>
        )}
        <Err>{chips.error}</Err>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 text-xs border-b border-slate-100">
              <tr>
                <th className="py-2 pr-2">Número</th>
                <th className="pr-2">Sessão</th>
                <th className="pr-2">Chip</th>
                <th className="pr-2">Proxy</th>
                <th className="pr-2">Hoje</th>
                <th className="pr-2">Saúde</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 pr-2">
                    <div className="font-medium text-slate-800">{c.label}</div>
                    <div className="text-xs text-slate-400">{c.phone}</div>
                    <button
                      type="button"
                      onClick={() => rename(c.id, c.label)}
                      className="text-xs text-emerald-600 hover:underline mt-0.5"
                    >
                      renomear
                    </button>
                  </td>
                  <td className="pr-2">
                    <StatusPill
                      label={SESSION_LABEL[c.sessionStatus] ?? c.sessionStatus}
                      className={
                        c.sessionStatus === 'CONNECTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.sessionStatus === 'PAIRING'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                      }
                    />
                  </td>
                  <td className="pr-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${CHIP_STATUS_COLOR[c.status] ?? 'bg-slate-100'}`}
                    >
                      {c.status}
                    </span>
                    <div className="text-xs text-slate-400 mt-0.5">rampa dia {c.rampDay}</div>
                  </td>
                  <td className="pr-2 text-xs text-slate-500">
                    {c.proxy ? (
                      <>
                        {c.proxy.region}
                        <br />
                        <span className="text-slate-400">{c.proxy.type}</span>
                      </>
                    ) : (
                      <span className="text-amber-600">sem proxy</span>
                    )}
                  </td>
                  <td className="pr-2 text-slate-600">
                    {c.sentToday}/{c.dailyCap}
                  </td>
                  <td className="pr-2">
                    <span
                      className={
                        c.healthScore >= 70
                          ? 'text-emerald-600'
                          : c.healthScore >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }
                    >
                      {Math.round(c.healthScore)}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap space-x-1">
                    {c.status !== 'RETIRED' && (
                      <>
                        <Btn
                          variant="ok"
                          onClick={() => setConnecting(c)}
                          disabled={c.sessionStatus === 'CONNECTED'}
                        >
                          {c.sessionStatus === 'CONNECTED' ? 'conectado' : 'conectar'}
                        </Btn>
                        {c.sessionStatus === 'DISCONNECTED' && (
                          <Btn variant="ghost" onClick={() => act(c.id, 'start')}>
                            religar
                          </Btn>
                        )}
                        <Btn variant="ghost" onClick={() => setConfiguring(c)}>
                          config
                        </Btn>
                        <Btn variant="ghost" onClick={() => act(c.id, 'pause')}>
                          pausar
                        </Btn>
                      </>
                    )}
                    {c.status !== 'RETIRED' && (
                      <Btn variant="danger" onClick={() => act(c.id, 'retire')}>
                        ×
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !chips.loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Nenhum número cadastrado. Adicione o primeiro acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {connecting && (
        <ConnectModal
          chip={connecting}
          proxies={proxies.data ?? []}
          onClose={() => {
            setConnecting(null);
            reload();
          }}
          onError={setError}
        />
      )}

      {configuring && (
        <ConfigModal
          chip={configuring}
          onClose={() => {
            setConfiguring(null);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function ProxyForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8080');
  const [region, setRegion] = useState('BR-SP');
  const [type, setType] = useState('residential');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createProxy({
        host,
        port: parseInt(port, 10),
        region,
        type,
        username: user || undefined,
        password: pass || undefined,
      });
      onCreated();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 p-3 bg-slate-50 rounded border border-slate-200">
      <Field label="Host">
        <Input value={host} onChange={(e) => setHost(e.target.value)} required />
      </Field>
      <Field label="Porta">
        <Input value={port} onChange={(e) => setPort(e.target.value)} required />
      </Field>
      <Field label="Região">
        <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="BR-SP" required />
      </Field>
      <Field label="Tipo">
        <select
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="residential">residential</option>
          <option value="mobile">mobile</option>
        </select>
      </Field>
      <Field label="Usuário">
        <Input value={user} onChange={(e) => setUser(e.target.value)} />
      </Field>
      <Field label="Senha">
        <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </Field>
      <div className="col-span-2 flex items-end">
        <Btn type="submit" disabled={busy}>
          {busy ? 'salvando…' : 'Salvar proxy'}
        </Btn>
      </div>
    </form>
  );
}

function ConnectModal({
  chip,
  proxies,
  onClose,
  onError,
}: {
  chip: ChipRow;
  proxies: any[];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [step, setStep] = useState<'proxy' | 'method' | 'pair' | 'done'>(
    chip.proxyId ? 'method' : 'proxy',
  );
  const [selectedProxy, setSelectedProxy] = useState(chip.proxyId ?? '');
  const [useCode, setUseCode] = useState(false);
  const [state, setState] = useState<any>({ status: 'INIT' });
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPairing = useCallback(async () => {
    setError(null);
    try {
      await api.pairChip(chip.id, useCode);
      const poll = async () => {
        try {
          const s = await api.pairState(chip.id);
          setState(s);
          if (s.status === 'CONNECTED') {
            if (timer.current) clearInterval(timer.current);
            setStep('done');
          }
        } catch (e: any) {
          setError(e.message);
        }
      };
      await poll();
      timer.current = setInterval(poll, 2000);
    } catch (e: any) {
      setError(e.message);
      onError(e.message);
    }
  }, [chip.id, useCode, onError]);

  useEffect(() => {
    if (step === 'pair') void startPairing();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [step, startPairing]);

  async function bindProxy() {
    if (!selectedProxy) {
      setError('Selecione um proxy.');
      return;
    }
    setBinding(true);
    setError(null);
    try {
      await api.bindProxy(chip.id, selectedProxy);
      setStep('method');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBinding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-emerald-700 text-white px-5 py-4">
          <h3 className="font-semibold text-lg">Conectar WhatsApp</h3>
          <p className="text-emerald-100 text-sm">{chip.label} · {chip.phone}</p>
        </div>

        <div className="px-5 py-4">
          <StepIndicator current={step} />

          <Err>{error}</Err>

          {step === 'proxy' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Antes de parear, vincule um <b>proxy estável</b> na mesma região do número
                (anti-ban).
              </p>
              <Field label="Proxy">
                <select
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  value={selectedProxy}
                  onChange={(e) => setSelectedProxy(e.target.value)}
                >
                  <option value="">— selecione —</option>
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.region} · {p.type} · {p.host}
                    </option>
                  ))}
                </select>
              </Field>
              {proxies.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Cadastre um proxy na seção Proxies antes de continuar.
                </p>
              )}
              <Btn onClick={bindProxy} disabled={binding || !selectedProxy} className="w-full">
                {binding ? 'vinculando…' : 'Vincular proxy e continuar'}
              </Btn>
            </div>
          )}

          {step === 'method' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Como deseja parear este número?</p>
              <button
                type="button"
                onClick={() => {
                  setUseCode(false);
                  setStep('pair');
                }}
                className="w-full text-left border-2 border-emerald-200 rounded-lg p-4 hover:bg-emerald-50 transition"
              >
                <div className="font-semibold text-slate-800">QR Code</div>
                <div className="text-xs text-slate-500 mt-1">
                  WhatsApp → Aparelhos conectados → Conectar aparelho → escanear
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseCode(true);
                  setStep('pair');
                }}
                className="w-full text-left border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
              >
                <div className="font-semibold text-slate-800">Código de 8 dígitos</div>
                <div className="text-xs text-slate-500 mt-1">
                  Para números que já estão no celular (link por telefone)
                </div>
              </button>
            </div>
          )}

          {step === 'pair' && (
            <div className="text-center py-2">
              {useCode ? (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    No WhatsApp: Aparelhos conectados → Conectar com número de telefone
                  </p>
                  {state.code ? (
                    <div className="text-4xl font-mono tracking-[0.3em] font-bold text-slate-800 py-6 bg-slate-50 rounded-lg">
                      {state.code}
                    </div>
                  ) : (
                    <div className="py-12 text-slate-400">Gerando código…</div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    Escaneie com o WhatsApp do número <b>{chip.phone}</b>
                  </p>
                  {state.qr ? (
                    <div className="flex justify-center p-4 bg-white border rounded-lg inline-block mx-auto">
                      <QRCodeSVG value={state.qr} size={256} level="M" />
                    </div>
                  ) : (
                    <div className="py-16 flex flex-col items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${SESSION_COLOR[state.status] ?? 'bg-slate-300'}`} />
                      <span className="text-slate-400 text-sm">
                        {state.status === 'PAIRING' ? 'Gerando QR…' : `Status: ${state.status}`}
                      </span>
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-slate-400 mt-4">O QR expira — atualiza sozinho</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✓</div>
              <div className="text-emerald-700 font-semibold text-lg">Conectado!</div>
              <p className="text-sm text-slate-500 mt-2">
                O chip entrou em <b>WARMING</b> — rampa de 5 mensagens/dia no primeiro dia.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
          {step === 'pair' && (
            <Btn variant="ghost" onClick={() => setStep('method')} className="flex-1">
              voltar
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose} className="flex-1">
            {step === 'done' ? 'fechar' : 'cancelar'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: string }) {
  const steps = [
    { id: 'proxy', label: 'Proxy' },
    { id: 'method', label: 'Método' },
    { id: 'pair', label: 'Parear' },
    { id: 'done', label: 'Pronto' },
  ];
  const order = ['proxy', 'method', 'pair', 'done'];
  const idx = order.indexOf(current);

  return (
    <div className="flex gap-1 mb-5">
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`flex-1 h-1 rounded-full ${
            i <= idx ? 'bg-emerald-500' : 'bg-slate-200'
          }`}
          title={s.label}
        />
      ))}
    </div>
  );
}

function ConfigModal({
  chip,
  onClose,
  onError,
}: {
  chip: ChipRow;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [windowStart, setWindowStart] = useState(String(chip.windowStart));
  const [windowEnd, setWindowEnd] = useState(String(chip.windowEnd));
  const [restSun, setRestSun] = useState((chip.restDays ?? []).includes(0));
  const [restSat, setRestSat] = useState((chip.restDays ?? []).includes(6));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const restDays: number[] = [];
    if (restSun) restDays.push(0);
    if (restSat) restDays.push(6);
    try {
      await api.updateChipConfig(chip.id, {
        windowStart: parseInt(windowStart, 10),
        windowEnd: parseInt(windowEnd, 10),
        restDays,
      });
      onClose();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Config · {chip.label}</h3>
        <p className="text-xs text-slate-400 mb-4">Janela comercial e dias de descanso (anti-ban)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início (h)">
            <Input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} type="number" min={0} max={23} />
          </Field>
          <Field label="Fim (h)">
            <Input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} type="number" min={1} max={24} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={restSun} onChange={(e) => setRestSun(e.target.checked)} />
          Descanso domingo
        </label>
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={restSat} onChange={(e) => setRestSat(e.target.checked)} />
          Descanso sábado
        </label>
        <div className="flex gap-2">
          <Btn onClick={save} disabled={busy} className="flex-1">
            {busy ? 'salvando…' : 'Salvar'}
          </Btn>
          <Btn variant="ghost" onClick={onClose} className="flex-1">
            cancelar
          </Btn>
        </div>
      </div>
    </div>
  );
}
