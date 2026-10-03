import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginScreen } from './features/auth/LoginScreen';
import { EngineerWorkspace } from './pages/EngineerWorkspace';

function PortalRoot() {
  const { engineer, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <span className="boot-dot" aria-hidden="true" />
        <span>Loading Engineer Portal…</span>
      </div>
    );
  }

  return engineer ? <EngineerWorkspace engineer={engineer} /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <PortalRoot />
    </AuthProvider>
  );
}
