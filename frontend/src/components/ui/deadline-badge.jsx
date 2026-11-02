import { deadline } from '../../utils/deadlines';
export function DeadlineBadge({ date, now }) {
  const urgency = deadline(date, now);
  return <span className="ui-deadline" data-urgency={urgency.level}>{urgency.label}</span>;
}
