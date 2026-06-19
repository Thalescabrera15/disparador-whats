import { useState } from 'react';
import { api } from '../lib/api';
import { Btn, Card, Err, useAsync } from '../ui';

type Turn = { direction: 'IN' | 'OUT'; content: string };

export function AiTest() {
  const flows = useAsync<any[]>(() => api.listFlows(), []);
  const [flowId, setFlowId] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [meta, setMeta] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!flowId || !input.trim()) return;
    setError(null);
    setBusy(true);
    const incoming = input;
    try {
      const r: any = await api.previewConversation(flowId, { incoming, history });
      const turns: Turn[] = [...history, { direction: 'IN', content: incoming }];
      if (r.optOut) {
        turns.push({ direction: 'OUT', content: '⛔ opt-out detectado — o lead seria suprimido.' });
      } else if (r.reply) {
        turns.push({ direction: 'OUT', content: r.reply });
      }
      setHistory(turns);
      setMeta(
        `guards: ${(r.guards ?? []).join(', ') || 'ok'} · link: ${r.linkReleased ? 'LIBERADO' : 'não'}` +
          `${r.handoff ? ' · handoff' : ''} · modelo: ${r.adapter ?? '—'}`,
      );
      setInput('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setHistory([]);
    setMeta(null);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-700">Testar a IA</h2>
      <p className="text-sm text-slate-500">
        Simule um lead respondendo, <b>sem enviar nada de verdade</b>. Use pra calibrar o script,
        ver se a IA segue a venda, e quando o link é liberado.
      </p>
      <Err>{error}</Err>

      <Card title="Campanha" right={<Btn variant="ghost" onClick={reset}>limpar</Btn>}>
        <select
          className="border border-slate-300 rounded px-3 py-2 text-sm w-full"
          value={flowId}
          onChange={(e) => {
            setFlowId(e.target.value);
            reset();
          }}
        >
          <option value="">— selecione —</option>
          {(flows.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </Card>

      {flowId && (
        <Card title="Conversa simulada">
          <div className="space-y-2 mb-3 min-h-[140px]">
            {history.map((t, i) => (
              <div key={i} className={t.direction === 'IN' ? 'text-right' : ''}>
                <span
                  className={`inline-block px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    t.direction === 'IN' ? 'bg-blue-100 text-blue-900' : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {t.content}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <p className="text-slate-400 text-sm">comece digitando como o lead responderia…</p>
            )}
          </div>
          {meta && <div className="text-[11px] text-slate-400 mb-2">{meta}</div>}
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="ex: tá caro isso aí"
            />
            <Btn onClick={send} disabled={busy}>{busy ? '…' : 'enviar'}</Btn>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Dica: mande 2-3 mensagens e depois "quero comprar, me manda o link" pra ver o link ser liberado.
          </p>
        </Card>
      )}
    </div>
  );
}
