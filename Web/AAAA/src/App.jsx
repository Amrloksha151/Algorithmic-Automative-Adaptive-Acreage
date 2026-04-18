import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  Droplets,
  Gauge,
  Leaf,
  LayoutDashboard,
  Loader2,
  Mic,
  MoonStar,
  Plus,
  Radio,
  Save,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sprout,
  SunMedium,
  Thermometer,
  TrendingDown,
  TrendingUp,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const projectName = 'Algorithmic Automative Adaptive Acreage'
const agentName = 'Agri'

const routes = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sensors', label: 'Sensors', icon: Gauge },
  { to: '/controls', label: 'Controls', icon: SlidersHorizontal },
  { to: '/agent', label: agentName, icon: BrainCircuit },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const sensorMeta = {
  temperature: { label: 'Temperature', unit: '°C', icon: Thermometer, color: 'var(--sensor-temp)' },
  humidity: { label: 'Humidity', unit: '%', icon: Droplets, color: 'var(--sensor-humid)' },
  soil: { label: 'Soil', unit: '%', icon: Sprout, color: 'var(--sensor-soil)' },
  light: { label: 'Light', unit: 'mol/m²/d', icon: SunMedium, color: 'var(--sensor-light)' },
}

const sensorDefaults = [
  { key: 'temperature', value: 24.6, min: 15, max: 25, delta: 0.4, status: 'warn', envMin: 20, envMax: 24 },
  { key: 'humidity', value: 66, min: 50, max: 75, delta: -1.2, status: 'ok', envMin: 60, envMax: 72 },
  { key: 'soil', value: 58, min: 40, max: 75, delta: 1.8, status: 'ok', envMin: 55, envMax: 68 },
  { key: 'light', value: 17.3, min: 15, max: 20, delta: -0.5, status: 'warn', envMin: 16, envMax: 18 },
]

const series = {
  temperature: [22.2, 22.8, 23.2, 23.9, 24.1, 24.3, 24.6],
  humidity: [72, 71, 69, 68, 67, 66, 66],
  soil: [61, 60, 60, 59, 59, 58, 58],
  light: [15.8, 16.1, 16.9, 17.4, 17.2, 17.1, 17.3],
}

const baseChartData = Array.from({ length: 8 }, (_, index) => ({
  time: `${9 + index}:00`,
  temperature: series.temperature[Math.min(index, series.temperature.length - 1)],
  humidity: series.humidity[Math.min(index, series.humidity.length - 1)],
  soil: series.soil[Math.min(index, series.soil.length - 1)],
  light: series.light[Math.min(index, series.light.length - 1)],
}))

const greenhousePresets = [
  { name: 'Tomatoes', emoji: '🍅', active: true },
  { name: 'Lettuce', emoji: '🥬' },
  { name: 'Herbs', emoji: '🌿' },
  { name: 'Peppers', emoji: '🫑' },
  { name: 'Custom', emoji: '＋' },
]

const controlGroups = [
  { name: 'Cooling Fan', icon: Zap, value: 80 },
  { name: 'Ventilation Fan', icon: MoonStar, value: 52 },
  { name: 'LED Grow Light', icon: SunMedium, value: 66 },
]

const toggleGroups = [
  { name: 'Irrigation Pump', icon: Droplets, on: true },
  { name: 'Mist Maker', icon: WifiOff, on: false },
  { name: '12V Water Pump', icon: Cpu, on: true },
]

const agentMessages = [
  { id: 1, role: 'assistant', text: `I am ${agentName}. I can review the greenhouse state, compare it to target conditions, and suggest actions.` },
  { id: 2, role: 'user', text: 'Check all sensors and adjust to ideal conditions.' },
  { id: 3, role: 'assistant', text: 'Temperature is slightly warm, humidity is within range, and soil moisture looks healthy. I would lower ventilation a little and keep irrigation steady.' },
]

const envPresets = [
  { id: 'tomatoes', name: 'Tomatoes', emoji: '🍅', temp: [20, 25], humidity: [60, 70], soil: [55, 70], light: [18, 20], photoperiod: 14 },
  { id: 'lettuce', name: 'Lettuce', emoji: '🥬', temp: [15, 20], humidity: [60, 75], soil: [50, 65], light: [15, 17], photoperiod: 14 },
  { id: 'herbs', name: 'Herbs', emoji: '🌿', temp: [18, 24], humidity: [55, 70], soil: [45, 65], light: [16, 18], photoperiod: 14 },
]

const initialEnvironment = {
  activePreset: 'tomatoes',
  temperature: { min: 20, max: 25 },
  humidity: { min: 60, max: 70 },
  soil: { min: 55, max: 70 },
  light: { min: 18, max: 20 },
  photoperiod: 14,
  plantedArea: 4,
}

function App() {
  const navigate = useNavigate()
  const [connectionState] = useState('connected')
  const [onboardingVisible, setOnboardingVisible] = useState(() => window.localStorage.getItem('aaaa-onboarding-complete') !== 'true')
  const [sensorValues] = useState(sensorDefaults)
  const [pwmValues, setPwmValues] = useState(controlGroups)
  const [toggleValues, setToggleValues] = useState(toggleGroups)
  const [environment, setEnvironment] = useState(initialEnvironment)
  const [settingsExpanded, setSettingsExpanded] = useState({ environment: true, keys: false, mqtt: false, database: false })

  const saveEnvironment = (next) => {
    setEnvironment(next)
  }

  return (
    <div className="app-shell">
      <Shell projectName={projectName} connectionState={connectionState} onOpenSettings={() => navigate('/settings')}>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                sensorValues={sensorValues}
                pwmValues={pwmValues}
                toggleValues={toggleValues}
                setPwmValues={setPwmValues}
                setToggleValues={setToggleValues}
                onOpenAgent={() => navigate('/agent')}
              />
            }
          />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route
            path="/controls"
            element={<ControlsPage pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} />}
          />
          <Route path="/agent" element={<AgentPage />} />
          <Route
            path="/settings"
            element={<SettingsPage environment={environment} setEnvironment={saveEnvironment} settingsExpanded={settingsExpanded} setSettingsExpanded={setSettingsExpanded} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>

      <StatusBar connectionState={connectionState} />
      {onboardingVisible ? <OnboardingFlow onFinish={() => {
        window.localStorage.setItem('aaaa-onboarding-complete', 'true')
        setOnboardingVisible(false)
      }} /> : null}
    </div>
  )
}

function Shell({ projectName, connectionState, onOpenSettings, children }) {
  return (
    <div className="shell">
      <TopBar projectName={projectName} connectionState={connectionState} onOpenSettings={onOpenSettings} />
      <Sidebar connectionState={connectionState} />
      <main className="main-panel">{children}</main>
    </div>
  )
}

function TopBar({ projectName, connectionState, onOpenSettings }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <Leaf size={22} className="brand-icon" />
        <div>
          <div className="brand-title">{projectName}</div>
          <div className="brand-subtitle">Client-side greenhouse dashboard</div>
        </div>
      </div>
      <ConnectionPill state={connectionState} />
      <div className="topbar-actions">
        <button type="button" className="icon-button" aria-label="Open settings" onClick={onOpenSettings}>
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}

function Sidebar({ connectionState }) {
  return (
    <aside className="sidebar">
      <nav className="nav-list">
        {routes.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className={`sidebar-status ${connectionState === 'connected' ? 'online' : 'offline'}`}>
        <Cpu size={16} />
        <div>
          <div>ESP32</div>
          <strong>{connectionState === 'connected' ? 'Online' : 'Offline'}</strong>
        </div>
      </div>
    </aside>
  )
}

function StatusBar({ connectionState }) {
  return (
    <footer className="statusbar">
      <span>Last update: just now</span>
      <span>Broker: local client-side bridge</span>
      <span>State: {connectionState}</span>
    </footer>
  )
}

function ConnectionPill({ state }) {
  const label = state === 'connected' ? 'Connected · my-greenhouse' : state
  return (
    <button type="button" className={`connection-pill ${state}`}>
      {state === 'connecting' ? <Loader2 size={14} className="spin" /> : <span className="pill-dot" />}
      <span>{label}</span>
    </button>
  )
}

function DashboardPage({ sensorValues, pwmValues, toggleValues, setPwmValues, setToggleValues, onOpenAgent }) {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Greenhouse control center</h1>
          <p className="hero-copy">Monitor sensors, adjust actuators, and keep the crop environment within target ranges.</p>
        </div>
        <button type="button" className="primary-button" onClick={onOpenAgent}>
          Ask {agentName}
          <ArrowRight size={16} />
        </button>
      </section>

      <AlertBanner />

      <div className="dashboard-grid">
        <section className="card-grid">
          {sensorValues.map((sensor) => (
            <SensorCard key={sensor.key} sensor={sensor} />
          ))}
        </section>

        <ControlPanel pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} />
      </div>

      <section className="quick-agent-bar" onClick={onOpenAgent} role="button" tabIndex={0}>
        <Mic size={18} />
        <span>Ask the AI agent to tune the greenhouse conditions</span>
        <ArrowRight size={16} />
      </section>
    </div>
  )
}

function SensorCard({ sensor }) {
  const meta = sensorMeta[sensor.key]
  const Icon = meta.icon
  const percent = ((sensor.value - sensor.min) / (sensor.max - sensor.min)) * 100
  const fillColor = sensor.status === 'warn' ? 'var(--status-warn)' : sensor.status === 'danger' ? 'var(--status-danger)' : meta.color

  return (
    <article className={`sensor-card ${sensor.status}`}>
      <div className="sensor-card-header">
        <Icon size={18} color={meta.color} />
        <span>{meta.label}</span>
      </div>
      <div className="sensor-value">
        {sensor.value}
        <span>{meta.unit}</span>
      </div>
      <div className="sensor-progress">
        <div className="sensor-progress-fill" style={{ width: `${percent}%`, background: fillColor }} />
      </div>
      <div className={`sensor-delta ${sensor.delta >= 0 ? 'up' : 'down'}`}>
        {sensor.delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        <span>{Math.abs(sensor.delta)} change from last reading</span>
      </div>
      <small className="sensor-range">Env target {sensor.envMin}–{sensor.envMax}</small>
      {sensor.status === 'offline' ? <div className="offline-overlay"><WifiOff size={20} /><span>Waiting for ESP32…</span></div> : null}
    </article>
  )
}

function ControlPanel({ pwmValues, toggleValues, setPwmValues, setToggleValues }) {
  return (
    <section className="control-panel card">
      <div className="section-heading">
        <h2>Manual controls</h2>
        <span>PWM and relay outputs</span>
      </div>

      <div className="control-stack">
        {pwmValues.map((control, index) => (
          <label key={control.name} className="range-control">
            <div className="control-row">
              <div className="control-label">
                <control.icon size={16} />
                <span>{control.name}</span>
              </div>
              <strong>{control.value}%</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={control.value}
              onChange={(event) => {
                const value = Number(event.target.value)
                setPwmValues((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, value } : item)))
              }}
            />
          </label>
        ))}
      </div>

      <div className="toggle-stack">
        {toggleValues.map((control, index) => (
          <button
            key={control.name}
            type="button"
            className={`toggle-row ${control.on ? 'on' : 'off'}`}
            onClick={() => setToggleValues((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, on: !item.on } : item)))}
          >
            <div className="control-label">
              <control.icon size={16} />
              <span>{control.name}</span>
            </div>
            <div className="toggle-track">
              <span className="toggle-thumb" />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function AlertBanner() {
  return (
    <section className="alert-banner">
      <AlertTriangle size={18} />
      <div>
        <strong>Temperature is slightly above the safe target.</strong>
        <p>Consider reducing fan speed or increasing shade to bring the canopy back into range.</p>
      </div>
      <button type="button" className="ghost-button">
        Ask {agentName}
      </button>
    </section>
  )
}

function SensorsPage() {
  return (
    <div className="page-stack">
      <section className="page-header card">
        <div>
          <p className="eyebrow">Telemetry</p>
          <h1>Sensor history</h1>
        </div>
        <div className="pill-group">
          {['1H', '6H', '24H', '7D'].map((item, index) => (
            <button key={item} type="button" className={`pill ${index === 2 ? 'active' : ''}`}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="chart-stack">
        {Object.entries(sensorMeta).map(([key, meta]) => (
          <section key={key} className="card chart-card">
            <div className="section-heading">
              <h2>{meta.label}</h2>
              <span>Recent readings</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={baseChartData}>
                <defs>
                  <linearGradient id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={meta.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={meta.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="5 5" />
                <XAxis dataKey="time" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey={key} stroke={meta.color} fill={`url(#gradient-${key})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        ))}
      </div>
    </div>
  )
}

function ControlsPage({ pwmValues, toggleValues, setPwmValues, setToggleValues }) {
  return (
    <div className="page-stack">
      <section className="page-header card">
        <div>
          <p className="eyebrow">Actuators</p>
          <h1>Manual controls</h1>
        </div>
      </section>
      <ControlPanel pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} />
    </div>
  )
}

function AgentPage() {
  return (
    <section className="agent-panel card">
      <div className="agent-header">
        <div>
          <p className="eyebrow">AI Agent</p>
          <h1>{agentName}</h1>
        </div>
        <ConnectionPill state="connected" />
      </div>

      <div className="agent-thread">
        {agentMessages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}`}>
            <div className="bubble-role">{message.role === 'assistant' ? agentName : 'You'}</div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <form className="agent-input" onSubmit={(event) => event.preventDefault()}>
        <input type="text" placeholder={`Type a command for ${agentName}...`} />
        <button type="submit" className="primary-button">
          Send
          <ArrowRight size={16} />
        </button>
      </form>
    </section>
  )
}

function SettingsPage({ environment, setEnvironment, settingsExpanded, setSettingsExpanded }) {
  const applyPreset = (preset) => {
    setEnvironment({
      ...environment,
      activePreset: preset.id,
      temperature: { min: preset.temp[0], max: preset.temp[1] },
      humidity: { min: preset.humidity[0], max: preset.humidity[1] },
      soil: { min: preset.soil[0], max: preset.soil[1] },
      light: { min: preset.light[0], max: preset.light[1] },
      photoperiod: preset.photoperiod,
    })
  }

  return (
    <div className="page-stack settings-stack">
      <SettingsSection
        title="Grow Environment"
        icon={Leaf}
        expanded={settingsExpanded.environment}
        onToggle={() => setSettingsExpanded((current) => ({ ...current, environment: !current.environment }))}
        summary="Tomatoes"
      >
        <div className="preset-row">
          {greenhousePresets.map((preset) => (
            <button key={preset.name} type="button" className={`preset-card ${environment.activePreset === preset.id ? 'active' : ''}`} onClick={() => applyPreset(envPresets.find((item) => item.id === preset.id) || envPresets[0])}>
              <span className="preset-emoji">{preset.emoji}</span>
              <span>{preset.name}</span>
            </button>
          ))}
        </div>

        <div className="environment-grid">
          <RangeControl label="Temperature" value={environment.temperature} onChange={(value) => setEnvironment({ ...environment, temperature: value })} unit="°C" />
          <RangeControl label="Humidity" value={environment.humidity} onChange={(value) => setEnvironment({ ...environment, humidity: value })} unit="%" />
          <RangeControl label="Soil Moisture" value={environment.soil} onChange={(value) => setEnvironment({ ...environment, soil: value })} unit="%" />
          <RangeControl label="Light" value={environment.light} onChange={(value) => setEnvironment({ ...environment, light: value })} unit="mol/m²/d" />
          <SingleValueControl label="Photoperiod" value={environment.photoperiod} onChange={(value) => setEnvironment({ ...environment, photoperiod: value })} unit="hrs/day" />
          <PlantedAreaInput value={environment.plantedArea} onChange={(value) => setEnvironment({ ...environment, plantedArea: value })} />
        </div>

        <div className="save-bar">
          <span>Unsaved changes</span>
          <div className="save-actions">
            <button type="button" className="ghost-button">Discard</button>
            <button type="button" className="primary-button"><Save size={16} />Save &amp; Apply</button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Gemini API Keys" icon={ShieldAlert} expanded={settingsExpanded.keys} onToggle={() => setSettingsExpanded((current) => ({ ...current, keys: !current.keys }))} summary="1 active key">
        <KeyRow label="#1" status="Active" value="AIza••••••••••xyz" />
        <KeyRow label="#2" status="Standby" value="AIza••••••••••abc" />
        <button type="button" className="add-key-button"><Plus size={16} /> Add API Key</button>
      </SettingsSection>

      <SettingsSection title="MQTT Broker" icon={Radio} expanded={settingsExpanded.mqtt} onToggle={() => setSettingsExpanded((current) => ({ ...current, mqtt: !current.mqtt }))} summary="Broker configured">
        <LabeledInput label="WebSocket URL" placeholder="wss://broker.hivemq.com:8884/mqtt" />
        <LabeledInput label="Topic Prefix" placeholder="greenhouse" />
        <div className="inline-note">Free brokers and local options can be swapped per client installation.</div>
      </SettingsSection>

      <SettingsSection title="Neon Database" icon={Settings} expanded={settingsExpanded.database} onToggle={() => setSettingsExpanded((current) => ({ ...current, database: !current.database }))} summary="Last write: today">
        <LabeledInput label="Connection URL" placeholder="postgres://user:pass@host/db" />
        <div className="inline-note">This UI only stores settings locally for now; backend integration is left to the client owner.</div>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({ title, icon, summary, expanded, onToggle, children }) {
  const SectionIcon = icon

  return (
    <section className="card settings-section">
      <button type="button" className="section-toggle" onClick={onToggle}>
        <div className="section-toggle-copy">
          <SectionIcon size={18} />
          <div>
            <strong>{title}</strong>
            <span>{summary}</span>
          </div>
        </div>
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {expanded ? <div className="section-body">{children}</div> : null}
    </section>
  )
}

function KeyRow({ label, status, value }) {
  return (
    <div className="key-row">
      <div>
        <strong>Key {label}</strong>
        <span>{status}</span>
      </div>
      <code>{value}</code>
      <div className="row-actions">
        <button type="button" className="ghost-button">Copy</button>
        <button type="button" className="ghost-button">Delete</button>
      </div>
    </div>
  )
}

function LabeledInput({ label, placeholder }) {
  return (
    <label className="labeled-input">
      <span>{label}</span>
      <input type="text" placeholder={placeholder} />
    </label>
  )
}

function RangeControl({ label, value, onChange, unit }) {
  return (
    <div className="range-panel">
      <div className="section-heading compact">
        <h2>{label}</h2>
        <span>System safe range</span>
      </div>
      <div className="range-inputs">
        <label>
          Min
          <input type="number" value={value.min} onChange={(event) => onChange({ ...value, min: Number(event.target.value) })} />
        </label>
        <label>
          Max
          <input type="number" value={value.max} onChange={(event) => onChange({ ...value, max: Number(event.target.value) })} />
        </label>
      </div>
      <small>Current range: {value.min}–{value.max} {unit}</small>
    </div>
  )
}

function SingleValueControl({ label, value, onChange, unit }) {
  return (
    <div className="range-panel">
      <div className="section-heading compact">
        <h2>{label}</h2>
        <span>Photoperiod</span>
      </div>
      <input type="range" min="12" max="16" step="0.5" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <div className="range-footer"><strong>{value}</strong> {unit}</div>
    </div>
  )
}

function PlantedAreaInput({ value, onChange }) {
  const dailyLightDose = (value * 18).toFixed(1)
  const waterNeed = (value * 1.2).toFixed(1)

  return (
    <div className="range-panel area-panel">
      <div className="section-heading compact">
        <h2>Planted Area</h2>
        <span>m²</span>
      </div>
      <input type="number" min="0.1" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} placeholder="e.g. 4.0" />
      <div className="area-summary">
        <div><span>Daily light dose</span><strong>{dailyLightDose} mol/day total</strong></div>
        <div><span>Est. water need</span><strong>~{waterNeed} L/day</strong></div>
      </div>
    </div>
  )
}

function OnboardingFlow({ onFinish }) {
  const [step, setStep] = useState(1)

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card card">
        <div className="stepper">{[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'active' : ''} />)}</div>
        {step === 1 ? (
          <div className="onboarding-step">
            <Leaf size={56} className="brand-icon hero" />
            <h2>Welcome to {projectName}</h2>
            <p>A greenhouse dashboard for any client-side greenhouse system, with AI assistance from {agentName}.</p>
            <button type="button" className="primary-button" onClick={() => setStep(2)}>Get Started</button>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="onboarding-step">
            <h2>Connect MQTT</h2>
            <p>Each user can wire their own broker, ESP32, and topic prefix on the client side.</p>
            <button type="button" className="primary-button" onClick={() => setStep(3)}>Continue</button>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="onboarding-step">
            <h2>Add a Gemini key</h2>
            <p>Use your own Gemini account to power {agentName}.</p>
            <button type="button" className="primary-button" onClick={onFinish}>Launch Dashboard</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App