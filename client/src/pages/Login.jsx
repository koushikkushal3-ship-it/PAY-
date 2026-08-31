import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="panel p-6 w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Ops Console</h1>
          <p className="text-sm text-mute-400 mt-1">Internal analyst access.</p>
        </div>

        <div className="space-y-2">
          <label className="label block">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-ink-900 border border-ink-500 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-2">
          <label className="label block">Password</label>
          <input
            type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-ink-900 border border-ink-500 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
          className="text-xs text-mute-400 hover:text-slate-300 w-full text-center"
        >
          {mode === 'signin' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
