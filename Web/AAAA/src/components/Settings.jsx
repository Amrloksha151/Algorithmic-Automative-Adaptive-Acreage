import React, { useState } from 'react'
import { 
  Leaf, 
  ShieldAlert, 
  Database, 
  Radio, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight 
} from 'lucide-react'
import { 
  greenhousePresets, 
  envPresets, 
  agentName 
} from '../lib/constants'

function SettingsSection({ title, icon, summary, expanded, onToggle, children }) {
  const Icon = icon
  return (
    <section className="card settings-section">
      <button className="section-toggle" onClick={onToggle}>
        <div className="section-toggle-copy">
          <Icon size={18} />
          <div><strong>{title}</strong><span>{summary}</span></div>
        </div>
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {expanded && <div className="section-body">{children}</div>}
    </section>
  )
}

function LabeledInput({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="labeled-input">
      <span>{label}</span>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  )
}

function RangeControl({ label, value, onChange, unit }) {
  return (
    <div className="range-panel">
      <div className="section-heading compact"><h2>{label}</h2></div>
      <div className="range-inputs">
        <label>Min <input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) })} /></label>
        <label>Target <input type="number" value={value.target} onChange={(e) => onChange({ ...value, target: Number(e.target.value) })} /></label>
        <label>Max <input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) })} /></label>
      </div>
      <small>Target: {value.target} {unit} (Safe: {value.min}–{value.max})</small>
    </div>
  )
}

export function SettingsPage({ 
  environment, 
  setEnvironment, 
  mqttSettings, 
  setMqttSettings, 
  applyMqttSettings, 
  aiSettings, 
  setAiSettings, 
  databaseSettings, 
  setDatabaseSettings, 
  onInitDB, 
  dbInitialized, 
  settingsExpanded, 
  setSettingsExpanded 
}) {
  const [newKey, setNewKey] = useState('')

  const applyPreset = (preset) => {
    setEnvironment({
      ...environment,
      activePreset: preset.id,
      plantDescription: `${preset.name} profile.`,
      temperature: { min: preset.temp[0], max: preset.temp[1], target: preset.tempTarget },
      humidity: { min: preset.humidity[0], max: preset.humidity[1], target: preset.humidityTarget },
      soil: { min: preset.soil[0], max: preset.soil[1], target: preset.soilTarget },
      light: { min: preset.light[0], max: preset.light[1], target: preset.lightTarget },
      photoperiod: preset.photoperiod,
    })
  }

  const addKey = (provider) => {
    if (!newKey.trim()) return
    setAiSettings(prev => ({
      ...prev,
      keys: { ...prev.keys, [provider]: [...prev.keys[provider], newKey.trim()] }
    }))
    setNewKey('')
  }

  const removeKey = (provider, index) => {
    setAiSettings(prev => ({
      ...prev,
      keys: { ...prev.keys, [provider]: prev.keys[provider].filter((_, i) => i !== index) }
    }))
  }

  return (
    <div className="page-stack settings-stack">
      <SettingsSection 
        title="Grow Environment" 
        icon={Leaf} 
        expanded={settingsExpanded.environment} 
        onToggle={() => setSettingsExpanded(c => ({ ...c, environment: !c.environment }))} 
        summary={environment.activePreset}
      >
        <div className="preset-row">
          {greenhousePresets.map((p) => (
            <button 
              key={p.id} 
              type="button" 
              className={`preset-card ${environment.activePreset === p.id ? 'active' : ''}`} 
              onClick={() => applyPreset(envPresets.find(i => i.id === p.id))}
            >
              <span className="preset-emoji">{p.emoji}</span><span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="environment-grid">
          <RangeControl label="Temperature" value={environment.temperature} onChange={(v) => setEnvironment({ ...environment, temperature: v })} unit="°C" />
          <RangeControl label="Humidity" value={environment.humidity} onChange={(v) => setEnvironment({ ...environment, humidity: v })} unit="%" />
          <RangeControl label="Soil Moisture" value={environment.soil} onChange={(v) => setEnvironment({ ...environment, soil: v })} unit="%" />
          <RangeControl label="Light" value={environment.light} onChange={(v) => setEnvironment({ ...environment, light: v })} unit="mol/m²/d" />
        </div>
      </SettingsSection>

      <SettingsSection 
        title="AI Provider Keys" 
        icon={ShieldAlert} 
        expanded={settingsExpanded.keys} 
        onToggle={() => setSettingsExpanded(c => ({ ...c, keys: !c.keys }))} 
        summary={`${aiSettings.provider} active`}
      >
        <div className="provider-select">
          <label>Active Provider:</label>
          <select value={aiSettings.provider} onChange={(e) => setAiSettings(prev => ({ ...prev, provider: e.target.value }))}>
            <option value="google">Google Gemini (Primary)</option>
            <option value="openai">OpenAI (Optional)</option>
          </select>
        </div>
        <div className="key-management">
          <h3>{aiSettings.provider === 'google' ? 'Google Gemini' : 'OpenAI'} Keys</h3>
          <div className="key-input-row">
            <input 
              type="password" 
              value={newKey} 
              onChange={(e) => setNewKey(e.target.value)} 
              placeholder="Add new API key..." 
            />
            <button onClick={() => addKey(aiSettings.provider)}><Plus size={18} /></button>
          </div>
          <div className="key-list">
            {(aiSettings.keys[aiSettings.provider] || []).map((k, i) => (
              <div key={i} className="key-item">
                <code>{k.slice(0, 8)}...{k.slice(-4)}</code>
                <button onClick={() => removeKey(aiSettings.provider, i)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          {aiSettings.provider === 'google' && aiSettings.keys.google.length === 0 && (
            <p className="error-note">At least one Google Gemini key is required for primary functions.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection 
        title="Neon Postgres" 
        icon={Database} 
        expanded={settingsExpanded.database} 
        onToggle={() => setSettingsExpanded(c => ({ ...c, database: !c.database }))} 
        summary={dbInitialized ? 'Connected' : 'Not Connected'}
      >
        <div className="environment-grid">
          <LabeledInput 
            label="Connection URL" 
            value={databaseSettings.connectionUrl} 
            onChange={(e) => setDatabaseSettings({ ...databaseSettings, connectionUrl: e.target.value })} 
            placeholder="postgres://user:pass@host/db"
          />
        </div>
        <div className="save-actions">
          <button type="button" className="primary-button" onClick={onInitDB}>
            {dbInitialized ? <CheckCircle2 size={16} /> : <Database size={16} />}
            {dbInitialized ? 'Re-initialize Schema' : 'Initialize & Connect'}
          </button>
        </div>
        <p className="inline-note">Enter your Neon Postgres connection string to enable remote data persistence.</p>
      </SettingsSection>

      <SettingsSection 
        title="MQTT Broker" 
        icon={Radio} 
        expanded={settingsExpanded.mqtt} 
        onToggle={() => setSettingsExpanded(c => ({ ...c, mqtt: !c.mqtt }))} 
        summary={mqttSettings.host || 'Not configured'}
      >
        <div className="environment-grid">
          <LabeledInput label="Broker host" value={mqttSettings.host} onChange={(e) => setMqttSettings({ ...mqttSettings, host: e.target.value })} />
          <LabeledInput label="Broker port" value={mqttSettings.port} onChange={(e) => setMqttSettings({ ...mqttSettings, port: e.target.value })} />
          <LabeledInput label="Topic prefix" value={mqttSettings.topicPrefix} onChange={(e) => setMqttSettings({ ...mqttSettings, topicPrefix: e.target.value })} />
        </div>
        <div className="save-actions">
          <button type="button" className="primary-button" onClick={applyMqttSettings}>
            <Save size={16} /> Save Broker Settings
          </button>
        </div>
      </SettingsSection>
    </div>
  )
}
