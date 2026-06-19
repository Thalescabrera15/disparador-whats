import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Btn, Card, Err, Field, Input, useAsync } from '../ui';

export function Dispatch() {
  const flows = useAsync<any[]>(() => api.listFlows(), []);
  const chips = useAsync<any[]>(() => api.chipInsights(), []);
  const [flowId, setFlowId] = useState('');
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowLink, setAllowLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDispatches(fid: string) {
    if (!fid) return setDispatches([]);
    setDispatches((await api.listDispatches(fid)) as any[]);
  }
  useEffect(() => {
    loadDispatches(flowId);
  }, [flowId]);

  function toggle(id: string) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  async function create() {
    setError(null);
    try {
      await api.createDispatch(flowId, {
        name,
        chipIds: [...selected],
        allowLinkInOpening: allowLink,
      });
      setName('');
      setSelected(new Set());
      setAllowLink(false);
      loadDispatches(flowId);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function setStatus(id: string, status: string) {
    await api.setDispatchStatus(id, status).catch((e) => setError(e.message));
    loadDispatches(flowId);
  }
  async function toggleLink(d: any) {
    await api.updateDispatch(d.id, { allowLinkInOpening: !d.allowLinkInOpening }).catch((e) => setError(e.message));
    loadDispatches(flowId);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-700">Disparo</h2>
      <p className="text-sm text-slate-500">
        Escolha a campanha, <b>quais números participam</b> (a esteira reveza só entre eles) e a
        política de link. Depois é só iniciar.
      </p>
      <Err>{error}</Err>

      <Card title="Campanha">
        <select
          className="border border-slate-300 rounded px-3 py-2 text-sm w-full"
          value={flowId}
          onChange={(e) => setFlowId(e.target.value)}
        >
          <option value="">— selecione —</option>
          {(flows.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </Card>

      {flowId && (
        <>
          <Card title="Novo disparo">
            <Field label="Nome do disparo">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="BF manhã" />
            </Field>
            <div className="text-xs font-medium text-slate-500 mb-1">
              Números participantes ({selected.size} selecionado{selected.size === 1 ? '' : 's'})
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(chips.data ?? []).map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer ${
                    selected.has(c.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                  }`}
                >
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex-1">{c.label}</span>
                  <Badge>{c.status}</Badge>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={allowLink} onChange={(e) => setAllowLink(e.target.checked)} />
              Permitir link já na abertura{' '}
              <span className="text-xs text-slate-400">(anti-ban: deixe desligado — link só após resposta)</span>
            </label>
            <Btn onClick={create} disabled={!name || selected.size === 0}>criar disparo</Btn>
          </Card>

          <Card title="Disparos desta campanha">
            <ul className="space-y-2">
              {dispatches.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-t border-slate-100 py-2 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{d.name}</span>{' '}
                    <span className="text-xs text-slate-400">· {d._count?.chips ?? 0} números</span>
                  </div>
                  <Badge>{d.status}</Badge>
                  <button onClick={() => toggleLink(d)} className="text-xs text-slate-500 hover:text-slate-700">
                    link na abertura: {d.allowLinkInOpening ? 'ON' : 'OFF'}
                  </button>
                  {d.status !== 'RUNNING' ? (
                    <Btn onClick={() => setStatus(d.id, 'RUNNING')}>iniciar</Btn>
                  ) : (
                    <Btn variant="ghost" onClick={() => setStatus(d.id, 'PAUSED')}>pausar</Btn>
                  )}
                </li>
              ))}
              {dispatches.length === 0 && <li className="text-slate-400 text-sm py-2">nenhum disparo ainda</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
