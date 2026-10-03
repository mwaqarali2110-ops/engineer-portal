import { Home, ClipboardList, LogOut, Sun, UserRound } from 'lucide-react';
import type { Engineer } from '../types/domain';

type Props = {
  engineer: Engineer;
  onLogout: () => void;
  view?: 'home' | 'surveys';
  onNavigate?: (view: 'home' | 'surveys') => void;
};

const roleLabels: Record<Engineer['role'], string> = {
  design_engineer: 'Design Engineer',
  survey_engineer: 'Survey Engineer',
  lead_engineer: 'Lead Engineer',
};

export function AppHeader({ engineer, onLogout, view = 'home', onNavigate }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand-glyph"><Sun size={16} /></span>
        <span className="brand-word">KaamAsaan</span>
        <span className="topbar-divider" aria-hidden="true" />
        <span className="topbar-title">Engineer Portal</span>
      </div>

      {onNavigate && <nav className="workspace-nav" aria-label="Workspace"><button aria-current={view==='home' ? 'page' : undefined} onClick={()=>onNavigate('home')}><Home size={18}/>Home</button><button aria-current={view==='surveys' ? 'page' : undefined} onClick={()=>onNavigate('surveys')}><ClipboardList size={18}/>Surveys</button></nav>}
      <div className="topbar-right">
        <div className="engineer-chip">
          <span className="engineer-avatar"><UserRound size={15} /></span>
          <span className="engineer-meta">
            <strong>{engineer.fullName}</strong>
            <small>{roleLabels[engineer.role]}</small>
          </span>
        </div>
        <button type="button" className="logout-button" onClick={onLogout}>
          <LogOut size={15} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
