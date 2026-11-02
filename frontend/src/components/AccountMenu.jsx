import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './ui/button';
const ROLES = { manager: 'Gestionnaire', commercial: 'Commercial', client: 'Client' };

export default function AccountMenu({ user, theme, toggleTheme, onLogout }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    const element = root.current;
    element?.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); element?.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="shell-account" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="shell-account-trigger" aria-label={`Compte : ${user?.name ?? 'Mon compte'}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="shell-avatar" aria-hidden="true">{user?.name?.trim().charAt(0) || 'L'}</span>
      <span className="shell-account-summary"><strong>{user?.name || 'Mon compte'}</strong><span>{ROLES[user?.role] ?? user?.role}</span></span>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && <div id={id} className="shell-account-panel" aria-label="Compte">
      <p className="shell-account-email">{user?.email}</p>
      <Button variant="ghost" onClick={toggleTheme}>Passer en mode {theme === 'dark' ? 'clair' : 'sombre'}</Button>
      <Button variant="ghost" onClick={onLogout}>Se déconnecter</Button>
    </div>}
  </div>;
}
