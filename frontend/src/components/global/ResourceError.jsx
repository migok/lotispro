import { Button } from '../ui/button';
export default function ResourceError({ label, onRetry }) {
  return <div role="alert" className="global-error"><span>{label}</span><Button variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button></div>;
}
