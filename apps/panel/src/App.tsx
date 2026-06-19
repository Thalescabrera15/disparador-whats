import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { auth } from './lib/api';
import { Login } from './screens/Login';
import { Chips } from './screens/Chips';
import { Campaign } from './screens/Campaign';
import { Dispatch } from './screens/Dispatch';
import { AiTest } from './screens/AiTest';

function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded text-sm font-medium ${
      isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`;
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-white border-r border-slate-200 p-4 flex flex-col">
        <div className="font-bold text-emerald-700 mb-6 px-2">dispatch‑engine</div>
        <nav className="space-y-1 flex-1">
          <NavLink to="/chips" className={link}>
            1 · Conectar números
          </NavLink>
          <NavLink to="/campanha" className={link}>
            2 · Campanha &amp; IA
          </NavLink>
          <NavLink to="/disparo" className={link}>
            3 · Disparo
          </NavLink>
          <NavLink to="/testar-ia" className={link}>
            Testar a IA
          </NavLink>
        </nav>
        <button
          onClick={() => {
            auth.token = null;
            nav('/login');
          }}
          className="text-xs text-slate-400 hover:text-slate-600 px-2 mt-4 text-left"
        >
          sair
        </button>
      </aside>
      <main className="flex-1 p-6 max-w-5xl">{children}</main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  if (!auth.isLogged) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/chips" element={<Protected><Chips /></Protected>} />
      <Route path="/campanha" element={<Protected><Campaign /></Protected>} />
      <Route path="/disparo" element={<Protected><Dispatch /></Protected>} />
      <Route path="/testar-ia" element={<Protected><AiTest /></Protected>} />
      <Route path="*" element={<Navigate to={auth.isLogged ? '/chips' : '/login'} replace />} />
    </Routes>
  );
}
