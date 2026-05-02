import React from 'react'
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts'
import { sensorMeta } from '../lib/constants'

export function SensorsPage({ telemetryHistory }) {
  const chartData = telemetryHistory.map(t => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ...t
  }))

  return (
    <div className="page-stack">
      <section className="page-header card">
        <h1>Sensor History</h1>
        <p>Real-time data from Neon Postgres</p>
      </section>
      <div className="chart-stack">
        {Object.entries(sensorMeta).map(([key, meta]) => (
          <section key={key} className="card chart-card">
            <div className="section-heading"><h2>{meta.label}</h2></div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={meta.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="5 5" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)' }} />
                <Area type="monotone" dataKey={key} stroke={meta.color} fill={`url(#gradient-${key})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        ))}
      </div>
    </div>
  )
}
