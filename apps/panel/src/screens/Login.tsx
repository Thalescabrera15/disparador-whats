import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Btn, Err, Field, Input } from '../ui';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.login(email, password);
      auth.token = r.accessToken;
      nav('/chips');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={submit}
        className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 w-80"
      >
        <h1 className="font-bold text-emerald-700 text-lg mb-1">dispatch‑engine</h1>
        <p className="text-xs text-slate-400 mb-5">painel admin</p>
        <Err>{error}</Err>
        <Field label="E-mail">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Field>
        <Field label="Senha">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
        </Field>
        <Btn type="submit" disabled={loading} className="w-full mt-2">
          {loading ? 'Entrando…' : 'Entrar'}
        </Btn>
      </form>
    </div>
  );
}
