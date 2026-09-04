import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Button, Card, TextField } from '../components/ui';
import { api } from '../lib/api';
import { writeToken } from '../lib/auth';
import { getConfig } from '../lib/config';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const config = getConfig();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.login(pin.trim());
      writeToken(result.token);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <Card className="login-card">
        <span className="brand-mark">
          <Icon name="loans" size={22} />
        </span>
        <h1>{config.appName}</h1>
        <p className="muted small" style={{ marginTop: 8, marginBottom: 24 }}>
          Desk sign-in. A handheld scanner types barcodes into the desk screen after you unlock.
        </p>
        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          <TextField
            label="Staff PIN"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            error={error}
            autoFocus
          />
          <Button variant="primary" size="lg" block type="submit" loading={busy} disabled={!pin.trim()}>
            Unlock the desk
          </Button>
        </form>
      </Card>
    </div>
  );
}
