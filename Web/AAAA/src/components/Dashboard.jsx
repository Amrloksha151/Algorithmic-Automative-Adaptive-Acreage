import React from 'react'
import { 
  BrainCircuit, 
  Loader2, 
  ToggleLeft, 
  ToggleRight, 
  TrendingUp, 
  TrendingDown,
  Zap,
  MoonStar,
  SunMedium,
  Cpu,
  Droplets,
  WifiOff,
  Thermometer,
  Sprout
} from 'lucide-react'
import { agentName, actuatorMap, sensorMeta } from '../lib/constants'

const iconMap = {
  Zap,
  MoonStar,
  SunMedium,
  Cpu,
  Droplets,
  WifiOff,
  Thermometer,
  Sprout
}

export function SensorCard({ sensor }) {
  const meta = sensorMeta[sensor.key]
  if (!meta) return null
  
  const Icon = iconMap[sensor.key === 'temperature' ? 'Thermometer' : 
               sensor.key === 'humidity' ? 'Droplets' : 
               sensor.key === 'soil' ? 'Sprout' : 
               sensor.key === 'light' ? 'SunMedium' : 'Cpu'] || (() => null)
  
  const percent = ((sensor.value - (sensor.min || 0)) / ((sensor.max || 100) - (sensor.min || 0))) * 100
  const fillColor = sensor.status === 'warn' ? 'var(--status-warn)' : sensor.status === 'danger' ? 'var(--status-danger)' : meta.color

  return (
    <article className={`sensor-card ${sensor.status}`}>
      <div className="sensor-card-header">
        <Icon size={18} color={meta.color} />
        <span style={{ marginLeft: '8px' }}>{meta.label}</span>
      </div>
      <div className="sensor-value">{sensor.value}<span>{meta.unit}</span></div>
      <div className="sensor-progress"><div className="sensor-progress-fill" style={{ width: `${percent}%`, background: fillColor }} /></div>
      <div className={`sensor-delta ${sensor.delta >= 0 ? 'up' : 'down'}`}>
        {sensor.delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        <span>{Math.abs(sensor.delta)} change</span>
      </div>
      <small className="sensor-range">Env target {sensor.envMin}–{sensor.envMax}</small>
    </article>
  )
}

export function ControlPanel({ pwmValues, toggleValues, setPwmValues, setToggleValues, publishCommand }) {
  return (
    <section className="control-panel card">
      <div className="section-heading"><h2>Manual Controls</h2><span>PWM and Relay</span></div>
      <div className="control-stack">
        {pwmValues.map((control, index) => {
          const Icon = iconMap[control.iconName] || Zap
          return (
            <label key={control.name} className="range-control">
              <div className="control-row">
                <div className="control-label">
                  <Icon size={16} />
                  <span>{control.name}</span>
                </div>
                <strong>{control.value}%</strong>
              </div>
              <input type="range" min="0" max="100" value={control.value} onChange={(e) => {
                const val = Number(e.target.value)
                setPwmValues(curr => curr.map((item, i) => i === index ? { ...item, value: val } : item))
                publishCommand(control.device, val, 'Manual update')
              }} />
            </label>
          )
        })}
      </div>
      <div className="toggle-stack">
        {toggleValues.map((control, index) => {
          const Icon = iconMap[control.iconName] || Droplets
          return (
            <button key={control.name} type="button" className={`toggle-row ${control.on ? 'on' : 'off'}`} onClick={() => {
              const next = !control.on
              setToggleValues(curr => curr.map((item, i) => i === index ? { ...item, on: next } : item))
              publishCommand(control.device, next ? 1 : 0, 'Manual update')
            }}>
              <div className="control-label">
                <Icon size={16} />
                <span>{control.name}</span>
              </div>
              <div className="toggle-track"><span className="toggle-thumb" /></div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function DashboardPage({ 
  sensorValues, 
  pwmValues, 
  toggleValues, 
  setPwmValues, 
  setToggleValues, 
  publishCommand, 
  agentOutput, 
  isAgentRunning, 
  onAskAgri, 
  aiSettings, 
  setAiSettings, 
  connectionState 
}) {
  const canToggleAutopilot = connectionState === 'connected' && (aiSettings.keys[aiSettings.provider] || []).length > 0;

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Greenhouse Control Center</h1>
          <p className="hero-copy">Monitor sensors and manage actuators locally with autonomous support.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className={`autopilot-toggle ${aiSettings.autopilotActive ? 'active' : ''}`}
            onClick={() => setAiSettings(prev => ({ ...prev, autopilotActive: !prev.autopilotActive }))}
            disabled={!canToggleAutopilot}
            title={!canToggleAutopilot ? "Requires MQTT connection and at least one API key" : "Toggle autonomous control"}
          >
            {aiSettings.autopilotActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            Autopilot
          </button>
          <button type="button" className="primary-button" onClick={onAskAgri} disabled={isAgentRunning}>
            {isAgentRunning ? <Loader2 size={16} className="spin" /> : <BrainCircuit size={16} />}
            Ask {agentName}
          </button>
        </div>
      </section>

      {agentOutput && (
        <section className="card agent-summary-card">
          <div className="section-heading">
            <h2>{agentName}'s Reasoning</h2>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
          <p className="agent-text">{agentOutput.text}</p>
          {agentOutput.actions.length > 0 && (
            <div className="action-list">
              {agentOutput.actions.map((a, i) => (
                <div key={i} className="action-item">
                  <strong>{actuatorMap[a.device] || a.device} → {a.value}</strong>
                  <span>{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="dashboard-grid">
        <section className="card-grid">
          {sensorValues.map((sensor) => (
            <SensorCard key={sensor.key} sensor={sensor} />
          ))}
        </section>
        <ControlPanel 
          pwmValues={pwmValues} 
          toggleValues={toggleValues} 
          setPwmValues={setPwmValues} 
          setToggleValues={setToggleValues} 
          publishCommand={publishCommand} 
        />
      </div>
    </div>
  )
}
