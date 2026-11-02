import { deadline } from '../../utils/deadlines';
export function DeadlineBadge({ date, now, isExpired, daysRemaining }) {
  const urgency = deadline(date, now, { isExpired, daysRemaining });
  return <span className="ui-deadline" data-urgency={urgency.level}>{urgency.label}</span>;
}
