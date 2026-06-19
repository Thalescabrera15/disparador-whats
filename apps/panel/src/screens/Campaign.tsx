import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Btn, Card, Err, Field, Input, TextArea, useAsync } from '../ui';

export function Campaign() {
  const flows = useAsync<any[]>(() => api.listFlows(), []);
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const f: any = await api.createFlow({ name: newName });
      setNewName('');
      flows.reload();
      setSel(f.id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-700">Campanha &amp; IA</h2>
      <p className="text-sm text-slate-500">
        Uma campanha = um produto. Aqui você define a IA (persona + conhecimento), as
        aberturas variadas, e sobe a lista de contatos.
      </p>

      <Card title="Campanhas">
        <Err>{error}</Err>
        <div className="flex gap-2 mb-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da campanha (ex: Código Sena)" />
          <Btn onClick={create}>criar</Btn>
        </div>
        <div className="flex flex-wrap gap-2">
          {(flows.data ?? []).map((f) => (
            <button
              key={f.id}
              onClick={() => setSel(f.id)}
              className={`px-3 py-1.5 rounded text-sm border ${
                sel === f.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300'
              }`}
            >
              {f.name}{' '}
              <span className="opacity-60 text-xs">({f._count?.leads ?? 0} leads)</span>
            </button>
          ))}
        </div>
      </Card>

      {sel && <FlowEditor key={sel} flowId={sel} />}
    </div>
  );
}

function FlowEditor({ flowId }: { flowId: string }) {
  const flow = useAsync<any>(() => api.getFlow(flowId), [flowId]);

  if (flow.loading) return <p className="text-sm text-slate-400">carregando…</p>;
  if (!flow.data) return <Err>{flow.error}</Err>;

  return (
    <>
      <AiConfig flow={flow.data} onSaved={flow.reload} />
      <Templates flowId={flowId} />
      <Leads flowId={flowId} />
    </>
  );
}

function AiConfig({ flow, onSaved }: { flow: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    aiModel: flow.aiModel ?? '',
    systemPrompt: flow.systemPrompt ?? '',
    knowledgeBase: flow.knowledgeBase ?? '',
    checkoutBaseUrl: flow.checkoutBaseUrl ?? '',
    bridgeDomain: flow.bridgeDomain ?? '',
    variables: JSON.stringify(flow.variables ?? {}, null, 0),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setMsg(null);
    let vars: any = {};
    try {
      vars = form.variables.trim() ? JSON.parse(form.variables) : {};
    } catch {
      setError('Variáveis: JSON inválido. Ex: {"valor":"R$ 97"}');
      return;
    }
    try {
      await api.updateFlow(flow.id, { ...form, variables: vars });
      setMsg('salvo!');
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card title="IA da campanha" right={msg ? <span className="text-emerald-600 text-xs">{msg}</span> : null}>
      <Err>{error}</Err>
      <Field label="Persona / objetivo (system prompt)">
        <TextArea rows={2} value={form.systemPrompt} onChange={set('systemPrompt')} placeholder="Você vende o Código Sena, curso de loteria…" />
      </Field>
      <Field label="Base de conhecimento (preço, garantia, objeções, FAQ)">
        <TextArea rows={3} value={form.knowledgeBase} onChange={set('knowledgeBase')} placeholder="Preço: R$ 97. Garantia: 7 dias. Objeção caro: se paga rápido…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="URL do checkout (destino do link)">
          <Input value={form.checkoutBaseUrl} onChange={set('checkoutBaseUrl')} placeholder="https://checkout.smpay.com/…" />
        </Field>
        <Field label="Domínio-ponte (opcional)">
          <Input value={form.bridgeDomain} onChange={set('bridgeDomain')} placeholder="meu-dominio-ponte.com" />
        </Field>
      </div>
      <Field label='Variáveis da campanha (JSON, ex: {"valor":"R$ 97"})'>
        <Input value={form.variables} onChange={set('variables')} />
      </Field>
      <Btn onClick={save}>salvar IA</Btn>
    </Card>
  );
}

function Templates({ flowId }: { flowId: string }) {
  const list = useAsync<any[]>(() => api.listOpenings(flowId), [flowId]);
  const [tpl, setTpl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [previewOut, setPreviewOut] = useState<any>(null);

  async function add() {
    setError(null);
    try {
      await api.createOpening(flowId, tpl);
      setTpl('');
      list.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function doPreview() {
    setError(null);
    try {
      const r = await api.previewTemplate(flowId, { template: preview || tpl });
      setPreviewOut(r);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <Card title="Aberturas (templates)">
      <p className="text-xs text-slate-400 mb-2">
        Variáveis: <code>{'{nome}'}</code> <code>{'{primeiro_nome}'}</code> colunas do CSV
        (<code>{'{cidade}'}</code>) ou da campanha (<code>{'{valor}'}</code>), fallback{' '}
        <code>{'{nome|cliente}'}</code>. <b>Sem link na abertura.</b>
      </p>
      <Err>{error}</Err>
      <div className="flex gap-2 mb-3">
        <TextArea rows={2} value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="Oi {primeiro_nome|}, conhece o {produto}? Posso te contar?" />
        <div className="flex flex-col gap-1">
          <Btn onClick={add}>adicionar</Btn>
          <Btn variant="ghost" onClick={() => { setPreview(tpl); doPreview(); }}>preview</Btn>
        </div>
      </div>
      {previewOut && (
        <div className="text-sm bg-slate-50 border border-slate-200 rounded p-3 mb-3">
          <div className="text-slate-700">{previewOut.rendered}</div>
          <div className="text-xs text-slate-400 mt-1">
            variáveis: {previewOut.variables?.join(', ') || '—'}
            {previewOut.missing?.length ? ` · faltando: ${previewOut.missing.join(', ')}` : ''}
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {(list.data ?? []).map((m) => (
          <li key={m.id} className="flex items-start gap-2 text-sm border-t border-slate-100 py-2">
            <span className="flex-1">{m.template}</span>
            {(m.variables ?? []).map((v: string) => <Badge key={v}>{v}</Badge>)}
            <button onClick={() => api.deleteOpening(flowId, m.id).then(list.reload)} className="text-red-400 hover:text-red-600 text-xs">remover</button>
          </li>
        ))}
        {list.data?.length === 0 && <li className="text-slate-400 text-sm py-2">nenhuma abertura ainda</li>}
      </ul>
    </Card>
  );
}

function Leads({ flowId }: { flowId: string }) {
  const stats = useAsync<any>(() => api.leadStats(flowId), [flowId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const r = await api.importLeads(flowId, file);
      setResult(r);
      stats.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <Card title="Lista de contatos">
      <Err>{error}</Err>
      <div className="flex items-center gap-2 mb-2">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="text-sm" />
        <Btn onClick={upload}>importar</Btn>
      </div>
      {result && (
        <p className="text-xs text-slate-500 mb-2">
          importados {result.inserted} · duplicados {result.duplicates} · inválidos {result.invalid} · suprimidos {result.suppressed}
        </p>
      )}
      {stats.data && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge>total {stats.data.total}</Badge>
          {Object.entries(stats.data.byStatus ?? {}).map(([k, v]) => (
            <Badge key={k}>{k}: {v as any}</Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
