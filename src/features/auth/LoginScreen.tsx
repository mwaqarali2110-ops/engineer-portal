import { useState } from 'react';
import type { FormEvent } from 'react';
import { LockKeyhole, LogIn, Mail, Sun } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { TextInput } from '../../components/ui/TextInput';
import { AuthError, authRules } from '../../services/authService';
import { isMockMode } from '../../lib/env';
import { useAuth } from './AuthContext';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');

    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Email is required.';
    if (!password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (error) {
      setFormError(
        // AuthError messages are already user-safe; a raw Supabase error never
        // reaches the UI.
        error instanceof AuthError ? error.message : 'Unable to sign in right now. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-brand">
          <span className="brand-glyph"><Sun size={18} /></span>
          <span className="brand-word">KaamAsaan</span>
        </div>

        <h1>Engineer Portal</h1>
        <p className="login-lede">
          Access survey bookings and prepare site engineering estimates.
        </p>

        <Field label="Email" htmlFor="login-email" error={fieldErrors.email}>
          <TextInput
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="engineer@kaamasaan.pk"
            icon={<Mail size={16} />}
            invalid={Boolean(fieldErrors.email)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="login-password"
          error={fieldErrors.password}
          hint={`Minimum ${authRules.minPasswordLength} characters.`}
        >
          <TextInput
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            icon={<LockKeyhole size={16} />}
            invalid={Boolean(fieldErrors.password)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <Button type="submit" block icon={<LogIn size={16} />} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </Button>

        <p className="login-foot">
          {isMockMode
            ? `Mock mode — any valid engineer email with a ${authRules.minPasswordLength}+ character password opens the workspace. No real survey data is read.`
            : 'Sign in with your KaamAsaan account. Survey access is decided by that account’s database permissions.'}
        </p>
      </form>
    </div>
  );
}
