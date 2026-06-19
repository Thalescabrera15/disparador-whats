import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { Badge, Btn, Card, Err, Field, Input, useAsync } from '../ui';

export function Chips() {
  const chips = useAsync<any[]>(() => api.chipInsights(), []);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ id: string; label: string } | null>(null);

  async function create() {
    setError(null);
    try {
      await api.createChip(label, phone);
      setLabel('');
      setPhone('');
      chips.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function act(id: string, action: 'start' | 'pause' | 'retire') {
    await api.chipAction(id, action).catch((e) => setError(e.message));
    chips.reload();
  }

  async function rename(id: string, current: string) {
    const name = prompt('Novo nome do número:', current);
    if (name) {
      await api.renameChip(id, name).catch((e) => setError(e.message));
      chips.reload();
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-700">Conectar números</h2>
      <p className="text-sm text-slate-500">
        Cada número é ativado num app de verdade e <b>pareado uma vez</b> aqui (escaneando o QR).
        Dê um nome a cada um — é por ele que você seleciona no disparo.
      </p>

      <Card title="Adicionar número">
        <Err>{error}</Err>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Field label="Nome (apelido)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vendas-01" />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Telefone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999990001" />
            </Field>
          </div>
          <Btn onClick={create} className="mb-3">Adicionar</Btn>
        </div>
      </Card>

      <Card title="Seus números" right={<Btn variant="ghost" onClick={chips.reload}>atualizar</Btn>}>
        {chips.loading && <p className="text-sm text-slate-400">carregando…</p>}
        <Err>{chips.error}</Err>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400 text-xs">
            <tr>
              <th className="py-1">Nome</th>
              <th>Status</th>
              <th>Rampa</th>
              <th>Hoje</th>
              <th>Saúde</th>
              <th>Resp.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(chips.data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">
                  {c.label}
                  <button onClick={() => rename(c.id, c.label)} className="ml-2 text-xs text-slate-400 hover:text-slate-600">✎</button>
                  <div className="text-xs text-slate-400">{c.phone}</div>
                </td>
                <td><Badge>{c.status}</Badge></td>
                <td>dia {c.rampDay}</td>
                <td>{c.sentToday}/{c.dailyCap}</td>
                <td>{Math.round(c.healthScore)}</td>
                <td>{c.responseRate}</td>
                <td className="text-right space-x-1">
                  <Btn variant="ok" onClick={() => setPairing({ id: c.id, label: c.label })}>Parear</Btn>
                  <Btn variant="ghost" onClick={() => act(c.id, 'pause')}>pausar</Btn>
                  <Btn variant="danger" onClick={() => act(c.id, 'retire')}>aposentar</Btn>
                </td>
              </tr>
            ))}
            {chips.data?.length === 0 && (
              <tr><td colSpan={7} className="py-3 text-slate-400 text-sm">nenhum número ainda</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {pairing && (
        <PairModal
          chip={pairing}
          onClose={() => {
            setPairing(null);
            chips.reload();
          }}
        />
      )}
    </div>
  );
}

function PairModal({
  chip,
  onClose,
}: {
  chip: { id: string; label: string };
  onClose: () => void;
}) {
  const [state, setState] = useState<any>({ status: 'INIT' });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    api.pairChip(chip.id).catch((e) => setError(e.message));
    const poll = async () => {
      try {
        const s = await api.pairState(chip.id);
        setState(s);
        if (s.status === 'CONNECTED') clearInterval(timer.current);
      } catch (e: any) {
        setError(e.message);
      }
    };
    poll();
    timer.current = setInterval(poll, 2500);
    return () => clearInterval(timer.current);
  }, [chip.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-96 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Parear · {chip.label}</h3>
        <p className="text-xs text-slate-400 mb-4">
          WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie:
        </p>
        <Err>{error}</Err>
        {state.status === 'CONNECTED' ? (
          <div className="py-10 text-emerald-600 font-semibold">✓ Conectado!</div>
        ) : state.qr ? (
          <div className="flex justify-center py-2">
            <QRCodeSVG value={state.qr} size={240} />
          </div>
        ) : state.code ? (
          <div className="py-8 text-2xl font-mono tracking-widest">{state.code}</div>
        ) : (
          <div className="py-10 text-slate-400 text-sm">gerando QR… (status: {state.status})</div>
        )}
        <Btn variant="ghost" onClick={onClose} className="mt-4 w-full">fechar</Btn>
      </div>
    </div>
  );
}
