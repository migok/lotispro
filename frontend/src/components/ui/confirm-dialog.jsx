import { useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from './button';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirmer', onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const returnFocus = useRef(null);
  const changeOpen = (next) => {
    if (running.current) return;
    setError('');
    onOpenChange(next);
  };
  const confirm = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onConfirm();
      if (result !== false) onOpenChange(false);
    } catch (failure) {
      setError(failure?.message || 'L’action a échoué. Réessayez.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return <AlertDialog.Root open={open} onOpenChange={changeOpen}>
    <AlertDialog.Portal container={document.fullscreenElement || undefined}>
      <AlertDialog.Overlay className="ui-overlay" />
      <AlertDialog.Content className="ui-dialog ui-confirm-dialog"
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement; }}
        onCloseAutoFocus={(event) => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }}
        onEscapeKeyDown={(event) => { if (running.current) event.preventDefault(); }}>
        <AlertDialog.Title className="ui-dialog-title">{title}</AlertDialog.Title>
        <AlertDialog.Description className="ui-dialog-description">{description}</AlertDialog.Description>
        {error && <p role="alert" className="ui-error">{error}</p>}
        <div className="ui-dialog-footer">
          <AlertDialog.Cancel asChild><Button variant="ghost" disabled={busy}>Annuler</Button></AlertDialog.Cancel>
          <Button variant="danger" loading={busy} onClick={confirm}>{confirmLabel}</Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
