import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { bucketLabel } from '../dashboard/period';

export default function TrendChart({ series, salesAvailable }) {
  return <div className="global-chart" role="group" aria-label="Lots vendus et réservations créées par période">
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <BarChart data={series} accessibilityLayer margin={{ top: 12, right: 8, bottom: 4, left: -20 }}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis dataKey="key" tickFormatter={bucketLabel} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} minTickGap={32} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip labelFormatter={bucketLabel} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} cursor={{ fill: 'var(--bg-tertiary)' }} />
        <Legend />
        {salesAvailable && <Bar name="Lots vendus" dataKey="lots_vendus" fill="var(--color-proprietaire)" radius={[3, 3, 0, 0]} isAnimationActive={false} />}
        <Bar name="Réservations créées" dataKey="reservations_creees" fill="var(--color-option)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
