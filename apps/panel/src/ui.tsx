import React from 'react';

export function Btn({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'ok';
}) {
  const styles: Record<string, string> = {
    primary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    ok: 'bg-blue-600 hover:bg-blue-700 text-white',
    ghost: 'bg-slate-200 hover:bg-slate-300 text-slate-700',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  return (
    <button
      {...props}
      className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputBase =
  'w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400';

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${inputBase} ${props.className ?? ''}`} />
);

export const TextArea = (
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) => <textarea {...props} className={`${inputBase} ${props.className ?? ''}`} />;

export function Err({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 my-2">
      {children}
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const run = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fn()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(run, [run]);
  return { data, error, loading, reload: run };
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
      {children}
    </span>
  );
}
