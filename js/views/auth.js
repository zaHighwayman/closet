import { html, useState } from '../lib/deps.js';
import { auth } from '../lib/db.js';
import { toast } from '../ui/components.js';

export function AuthView() {
  const [mode, setMode] = useState('signin'); // signin | signup | magic | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password);
      else if (mode === 'signup') {
        const r = await auth.signUp(email, password);
        if (!r.session) setSent('Check your email to confirm your account, then come back here.');
      } else if (mode === 'magic') { await auth.magicLink(email); setSent('Check your email for a sign-in link.'); }
      else if (mode === 'reset') { await auth.resetPassword(email); setSent('Check your email for a password reset link.'); }
    } catch (err) { toast(err, 'error'); }
    setBusy(false);
  }

  return html`<div class="auth">
    <div class="auth-card">
      <div class="brand"><span class="logo">◐</span> Closet</div>
      <p class="muted">Your wardrobe, styled with real colour and layering theory. Free, no subscriptions.</p>
      ${sent ? html`<div class="notice">${sent}</div><button class="btn ghost" onClick=${() => setSent(null)}>Back</button>` : html`
        <form onSubmit=${submit} class="form">
          <label>Email<input type="email" required autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} /></label>
          ${mode === 'signin' || mode === 'signup' ? html`
            <label>Password<input type="password" required minlength="8" autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} value=${password} onInput=${(e) => setPassword(e.target.value)} /></label>` : null}
          <button class="btn primary wide" disabled=${busy}>${busy ? '…' : { signin: 'Sign in', signup: 'Create account', magic: 'Email me a link', reset: 'Send reset link' }[mode]}</button>
        </form>
        <div class="or"><span>or</span></div>
        <button class="btn wide" onClick=${() => auth.google().catch((e) => toast(e, 'error'))}>Continue with Google</button>
        <div class="auth-links">
          ${mode !== 'signin' ? html`<button class="link" onClick=${() => setMode('signin')}>Sign in with password</button>` : null}
          ${mode !== 'signup' ? html`<button class="link" onClick=${() => setMode('signup')}>Create an account</button>` : null}
          ${mode !== 'magic' ? html`<button class="link" onClick=${() => setMode('magic')}>Email me a sign-in link</button>` : null}
          ${mode === 'signin' ? html`<button class="link" onClick=${() => setMode('reset')}>Forgot password?</button>` : null}
        </div>
        <p class="muted small">You stay signed in on this device until you sign out.</p>`}
    </div>
  </div>`;
}
