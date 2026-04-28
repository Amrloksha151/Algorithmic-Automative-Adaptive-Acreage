import { useEffect, useRef, useState } from 'react'
import mqtt from 'mqtt'
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
const storagePrefix = 'algorithmic-automative-adaptive-acreage'

const legacyStorageKeys = {
  environment: 'aaaa-environment-settings',
  database: 'aaaa-database-settings',
  mqtt: 'aaaa-mqtt-settings',
  aiService: 'aaaa-ai-service-settings',
  onboarding: 'aaaa-onboarding-complete',
}

const storageKeys = {
  environment: `${storagePrefix}-environment-settings`,
  database: `${storagePrefix}-database-settings`,
  mqtt: `${storagePrefix}-mqtt-settings`,
  aiService: `${storagePrefix}-ai-service-settings`,
  onboarding: `${storagePrefix}-onboarding-complete`,
}

const defaultMqttSettings = {
  protocol: 'ws',
  host: 'broker.hivemq.com',
  port: '8000',
  path: '/mqtt',
  topicPrefix: 'greenhouse-19207',
  username: '',
  password: '',
}

const defaultDatabaseSettings = {
  connectionUrl: '',
  tableName: 'greenhouse_events',
}

const defaultAiServiceSettings = {
  apiBaseUrl: 'https://api.amrloksha151.top',
  ttlSeconds: 8 * 60 * 60,
}

const actuatorMap = {
  cooling_fan: 'Cooling Fan',
  ventilation_fan: 'Ventilation Fan',
  led_strip: 'LED Grow Light',
  pump_5v: 'Irrigation Pump',
  mist_maker: 'Mist Maker',
  pump_12v: '12V Water Pump',
}

function readStoredValue(keys) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) {
        return raw
      }
    }
  } catch {
    return null
  }

  return null
}

function safeReadJson(keys, fallback) {
  const raw = readStoredValue(Array.isArray(keys) ? keys : [keys])

  if (!raw) {
    return fallback
  }

  try {
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function brokerUrlFromSettings(settings) {
  const protocol = 'ws'
  const path = settings.path?.startsWith('/') ? settings.path : `/${settings.path || 'mqtt'}`

  return `${protocol}://${settings.host}:${settings.port}${path}`
}

function getCommandTopic(prefix) {
  return `${prefix}/commands`
}

function getSensorTopic(prefix) {
  return `${prefix}/sensors`
}

function getActuatorStateTopic(prefix) {
  return `${prefix}/actuators/state`
}

function getStatusTopic(prefix) {
  return `${prefix}/status`
}

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
  { name: 'Cooling Fan', device: 'cooling_fan', icon: Zap, value: 80 },
  { name: 'Ventilation Fan', device: 'ventilation_fan', icon: MoonStar, value: 52 },
  { name: 'LED Grow Light', device: 'led_strip', icon: SunMedium, value: 66 },
]

const toggleGroups = [
  { name: 'Irrigation Pump', device: 'pump_5v', icon: Droplets, on: true },
  { name: 'Mist Maker', device: 'mist_maker', icon: WifiOff, on: false },
  { name: '12V Water Pump', device: 'pump_12v', icon: Cpu, on: true },
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
  plantDescription: 'Warm-season fruiting crop with high light demand.',
  temperature: { min: 20, max: 25 },
  humidity: { min: 60, max: 70 },
  soil: { min: 55, max: 70 },
  light: { min: 18, max: 20 },
  photoperiod: 14,
  plantedArea: 4,
}

function App() {
  const navigate = useNavigate()
  const mqttClientRef = useRef(null)
  const [connectionState, setConnectionState] = useState('offline')
  const [onboardingVisible, setOnboardingVisible] = useState(() => readStoredValue([storageKeys.onboarding, legacyStorageKeys.onboarding]) !== 'true')
  const [sensorValues, setSensorValues] = useState(sensorDefaults)
  const [telemetryHistory, setTelemetryHistory] = useState([])
  const [pwmValues, setPwmValues] = useState(controlGroups)
  const [toggleValues, setToggleValues] = useState(toggleGroups)
  const [environment, setEnvironment] = useState(() => safeReadJson([storageKeys.environment, legacyStorageKeys.environment], initialEnvironment))
  const [databaseSettings, setDatabaseSettings] = useState(() => safeReadJson([storageKeys.database, legacyStorageKeys.database], defaultDatabaseSettings))
  const [mqttSettings, setMqttSettings] = useState(() => safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings))
  const [mqttDraft, setMqttDraft] = useState(() => safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings))
  const [aiServiceSettings, setAiServiceSettings] = useState(() => safeReadJson([storageKeys.aiService, legacyStorageKeys.aiService], defaultAiServiceSettings))
  const [aiKeyDraft, setAiKeyDraft] = useState({ openaiKey: '', googleKey: '' })
  const [aiKeyStatus, setAiKeyStatus] = useState(null)
  const [aiKeyMessage, setAiKeyMessage] = useState('')
  const [settingsExpanded, setSettingsExpanded] = useState({ environment: true, keys: false, mqtt: false, database: false })
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [recommendation, setRecommendation] = useState(null)

  useEffect(() => {
    window.localStorage.setItem(storageKeys.environment, JSON.stringify(environment))
  }, [environment])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.mqtt, JSON.stringify(mqttSettings))
  }, [mqttSettings])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.database, JSON.stringify(databaseSettings))
  }, [databaseSettings])

  useEffect(() => {
    window.localStorage.setItem(storageKeys.aiService, JSON.stringify(aiServiceSettings))
  }, [aiServiceSettings])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      if (window.localStorage.getItem(legacyStorageKeys.onboarding) === 'true' && window.localStorage.getItem(storageKeys.onboarding) !== 'true') {
        window.localStorage.setItem(storageKeys.onboarding, 'true')
      }
    } catch {
      // Ignore storage migration failures; the app still renders with in-memory state.
    }
  }, [])

  useEffect(() => {
    if (!mqttSettings.host || !mqttSettings.port) {
      const offlineTimer = window.setTimeout(() => {
        setConnectionState('offline')
      }, 0)

      return () => window.clearTimeout(offlineTimer)
    }

    const brokerUrl = brokerUrlFromSettings(mqttSettings)
    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse'
    const topics = {
      sensors: getSensorTopic(topicPrefix),
      actuators: getActuatorStateTopic(topicPrefix),
      status: getStatusTopic(topicPrefix),
    }

    const connectingTimer = window.setTimeout(() => {
      setConnectionState('connecting')
    }, 0)
    let isActive = true
    const client = mqtt.connect(brokerUrl, {
      username: mqttSettings.username || undefined,
      password: mqttSettings.password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
    })
    mqttClientRef.current = client

    const updateFromSnapshot = (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') {
        return
      }

      setTelemetryHistory((current) => ([
        ...current.slice(-299),
        {
          timestamp: Date.now(),
          temperature: snapshot.temperature,
          humidity: snapshot.humidity,
          soil: snapshot.soil,
          light: snapshot.light,
        },
      ]))

      setSensorValues((current) => current.map((sensor) => {
        if (Object.prototype.hasOwnProperty.call(snapshot, sensor.key) && snapshot[sensor.key] != null) {
          return { ...sensor, value: Number(snapshot[sensor.key]) }
        }
        return sensor
      }))

      if (snapshot.actuators && typeof snapshot.actuators === 'object') {
        setPwmValues((current) => current.map((control) => {
          const nextValue = snapshot.actuators[control.device]
          return typeof nextValue === 'number' ? { ...control, value: nextValue } : control
        }))
        setToggleValues((current) => current.map((control) => {
          const nextValue = snapshot.actuators[control.device]
          return typeof nextValue === 'number' ? { ...control, on: Boolean(nextValue) } : control
        }))
      }
    }

    client.on('connect', () => {
      if (!isActive) {
        return
      }
      setConnectionState('connected')
      client.subscribe([topics.sensors, topics.actuators, topics.status])
      setLastSyncAt(new Date().toISOString())
    })

    client.on('message', (topic, payload) => {
      if (!isActive) {
        return
      }
      const text = payload.toString()

      if (topic === topics.status) {
        setConnectionState(text === 'online' ? 'connected' : 'offline')
        setLastSyncAt(new Date().toISOString())
        return
      }

      try {
        updateFromSnapshot(JSON.parse(text))
        setLastSyncAt(new Date().toISOString())
      } catch {
        updateFromSnapshot({})
      }
    })

    client.on('reconnect', () => {
      if (!isActive) {
        return
      }
      setConnectionState('connecting')
    })
    client.on('close', () => {
      if (!isActive) {
        return
      }
      setConnectionState('offline')
    })
    client.on('offline', () => {
      if (!isActive) {
        return
      }
      setConnectionState('offline')
    })
    client.on('error', () => {
      if (!isActive) {
        return
      }
      setConnectionState('offline')
    })

    return () => {
      window.clearTimeout(connectingTimer)
      isActive = false
      if (mqttClientRef.current === client) {
        mqttClientRef.current = null
      }
      client.end()
    }
  }, [mqttSettings])

  const publishCommand = (device, value, reason) => {
    const client = mqttClientRef.current
    if (!client || connectionState !== 'connected') {
      return false
    }

    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse'
    client.publish(
      getCommandTopic(topicPrefix),
      JSON.stringify({
        device,
        value,
        reason,
        mode: recommendation?.mode || 'manual',
        source: 'web-ui',
        timestamp: new Date().toISOString(),
      }),
    )
    setLastSyncAt(new Date().toISOString())
    return true
  }

  const applyMqttSettings = () => {
    setMqttSettings(mqttDraft)
  }

  const handleRecommendAutonomy = async () => {
    const baseUrl = aiServiceSettings.apiBaseUrl?.trim()
    const telemetryPayload = telemetryHistory.slice(-30)

    if (baseUrl) {
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/ai/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environment,
            telemetry: telemetryPayload,
            openai_key: aiKeyDraft.openaiKey || undefined,
            google_key: aiKeyDraft.googleKey || undefined,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setRecommendation(data)
          setAiKeyMessage('AI recommendation loaded from companion service.')
          setAiKeyDraft({ openaiKey: '', googleKey: '' })
          return
        }

        const errorText = await response.text()
        setAiKeyMessage(`Companion service rejected request: ${errorText}`)
      } catch (error) {
        setAiKeyMessage(`Companion service unavailable, using local heuristic: ${error.message}`)
      }
    }

    const latest = telemetryHistory[telemetryHistory.length - 1] || {}
    const fiveMinutesAgo = telemetryHistory.slice().reverse().find((entry) => Date.now() - entry.timestamp >= 5 * 60 * 1000) || telemetryHistory[0]
    const latestTimestamp = latest.timestamp || Date.now()
    const baselineTimestamp = fiveMinutesAgo?.timestamp || (latestTimestamp - (5 * 60 * 1000))
    const timeDeltaMinutes = Math.max((latestTimestamp - baselineTimestamp) / 60000, 0.5)

    const latestTemperature = Number(sensorValues.find((sensor) => sensor.key === 'temperature')?.value ?? 0)
    const latestHumidity = Number(sensorValues.find((sensor) => sensor.key === 'humidity')?.value ?? 0)
    const latestSoil = Number(sensorValues.find((sensor) => sensor.key === 'soil')?.value ?? 0)
    const latestLight = Number(sensorValues.find((sensor) => sensor.key === 'light')?.value ?? 0)

    const baselineTemperature = Number(fiveMinutesAgo?.temperature ?? latestTemperature)
    const baselineHumidity = Number(fiveMinutesAgo?.humidity ?? latestHumidity)
    const baselineSoil = Number(fiveMinutesAgo?.soil ?? latestSoil)
    const baselineLight = Number(fiveMinutesAgo?.light ?? latestLight)

    const temperatureRate = (latestTemperature - baselineTemperature) / timeDeltaMinutes
    const humidityRate = (latestHumidity - baselineHumidity) / timeDeltaMinutes
    const soilRate = (latestSoil - baselineSoil) / timeDeltaMinutes
    const lightRate = (latestLight - baselineLight) / timeDeltaMinutes

    const temperatureGap = environment.temperature.max - latestTemperature
    const humidityGap = environment.humidity.min - latestHumidity
    const soilGap = environment.soil.min - latestSoil
    const lightGap = environment.light.min - latestLight

    const coolingFan = Math.max(0, Math.min(100, Math.round((Math.max(temperatureGap, 0) * 14) + Math.max(temperatureRate, 0) * 30 + Math.max(humidityGap, 0) * 1.5)))
    const ventilationFan = Math.max(0, Math.min(100, Math.round((Math.max(temperatureGap, 0) * 10) + Math.max(humidityGap, 0) * 3 + Math.max(0, humidityRate * -20))))
    const ledStrip = lightGap > 0 ? Math.max(0, Math.min(100, Math.round(Math.min(100, 30 + (lightGap * 12) + Math.max(0, -lightRate * 10))))) : 0
    const irrigationPump = soilGap > 0 || soilRate < -0.1 ? 1 : 0
    const mistMaker = humidityGap > 2 || humidityRate < -0.15 ? 1 : 0
    const waterPump = temperatureGap > 1.5 || temperatureRate > 0.15 ? 1 : 0

    const nextRecommendation = {
      mode: 'autonomous',
      reason: `Crop profile ${environment.activePreset}; temperature drift ${temperatureRate.toFixed(2)} °C/min and humidity drift ${humidityRate.toFixed(2)} %/min.`,
      analysis: {
        temperatureRate,
        humidityRate,
        soilRate,
        lightRate,
      },
      controls: [
        { device: 'cooling_fan', value: coolingFan },
        { device: 'ventilation_fan', value: ventilationFan },
        { device: 'led_strip', value: ledStrip },
        { device: 'pump_5v', value: irrigationPump },
        { device: 'mist_maker', value: mistMaker },
        { device: 'pump_12v', value: waterPump },
      ],
    }

    setRecommendation(nextRecommendation)
  }

  const submitAiKeys = async () => {
    const baseUrl = aiServiceSettings.apiBaseUrl?.trim()
    if (!baseUrl) {
      setAiKeyStatus('Set the companion service URL first.')
      return
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openai_key: aiKeyDraft.openaiKey || undefined,
          google_key: aiKeyDraft.googleKey || undefined,
          ttl_seconds: aiServiceSettings.ttlSeconds,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        setAiKeyStatus(`Failed to store keys: ${text}`)
        return
      }

      const data = await response.json()
      setAiKeyStatus(`Keys active until ${data.expires_at ? new Date(data.expires_at * 1000).toLocaleTimeString() : 'the configured TTL'}.`)
      setAiKeyDraft({ openaiKey: '', googleKey: '' })
    } catch (error) {
      setAiKeyStatus(`Unable to reach companion service: ${error.message}`)
    }
  }

  const clearAiKeys = async () => {
    const baseUrl = aiServiceSettings.apiBaseUrl?.trim()
    if (!baseUrl) {
      setAiKeyStatus('Set the companion service URL first.')
      return
    }

    try {
      await fetch(`${baseUrl.replace(/\/$/, '')}/keys`, { method: 'DELETE' })
      setAiKeyStatus('Transient keys cleared from the companion service.')
    } catch (error) {
      setAiKeyStatus(`Unable to clear keys: ${error.message}`)
    }
  }

  const applyRecommendation = () => {
    if (!recommendation) {
      return
    }

    recommendation.controls.forEach((control) => {
      publishCommand(control.device, control.value, recommendation.reason)
    })
    setRecommendation(null)
  }

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
                publishCommand={publishCommand}
                recommendation={recommendation}
                onRecommendAutonomy={handleRecommendAutonomy}
                onApplyRecommendation={applyRecommendation}
                onOpenAgent={() => navigate('/agent')}
              />
            }
          />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route
            path="/controls"
            element={<ControlsPage pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} publishCommand={publishCommand} />}
          />
          <Route path="/agent" element={<AgentPage />} />
          <Route
            path="/settings"
            element={<SettingsPage environment={environment} setEnvironment={saveEnvironment} databaseSettings={databaseSettings} setDatabaseSettings={setDatabaseSettings} mqttSettings={mqttDraft} setMqttSettings={setMqttDraft} applyMqttSettings={applyMqttSettings} aiServiceSettings={aiServiceSettings} setAiServiceSettings={setAiServiceSettings} aiKeyDraft={aiKeyDraft} setAiKeyDraft={setAiKeyDraft} aiKeyStatus={aiKeyStatus} aiKeyMessage={aiKeyMessage} submitAiKeys={submitAiKeys} clearAiKeys={clearAiKeys} settingsExpanded={settingsExpanded} setSettingsExpanded={setSettingsExpanded} lastSyncAt={lastSyncAt} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>

      <StatusBar connectionState={connectionState} lastSyncAt={lastSyncAt} />
      {onboardingVisible ? <OnboardingFlow onFinish={() => {
        window.localStorage.setItem(storageKeys.onboarding, 'true')
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

function StatusBar({ connectionState, lastSyncAt }) {
  return (
    <footer className="statusbar">
      <span>Last update: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'waiting for data'}</span>
      <span>Broker: browser MQTT bridge</span>
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

function DashboardPage({ sensorValues, pwmValues, toggleValues, setPwmValues, setToggleValues, publishCommand, recommendation, onRecommendAutonomy, onApplyRecommendation, onOpenAgent }) {
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

      <AlertBanner onRecommendAutonomy={onRecommendAutonomy} />

      {recommendation ? (
        <section className="card" style={{ padding: '1rem 1.25rem' }}>
          <div className="section-heading">
            <h2>Autonomous suggestion</h2>
            <span>{recommendation.reason}</span>
          </div>
          <div className="control-stack">
            {recommendation.controls.map((item) => (
              <div key={item.device} className="key-row">
                <div>
                  <strong>{actuatorMap[item.device] || item.device}</strong>
                  <span>{item.device}</span>
                </div>
                <code>{item.value}</code>
              </div>
            ))}
          </div>
          <div className="save-actions">
            <button type="button" className="ghost-button" onClick={onRecommendAutonomy}>Regenerate</button>
            <button type="button" className="primary-button" onClick={onApplyRecommendation}>Apply recommendation</button>
          </div>
        </section>
      ) : null}

      <div className="dashboard-grid">
        <section className="card-grid">
          {sensorValues.map((sensor) => (
            <SensorCard key={sensor.key} sensor={sensor} />
          ))}
        </section>

        <ControlPanel pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} publishCommand={publishCommand} />
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

function ControlPanel({ pwmValues, toggleValues, setPwmValues, setToggleValues, publishCommand }) {
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
                publishCommand(control.device, value, `${control.name} manual update`)
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
            onClick={() => {
              const nextOn = !control.on
              setToggleValues((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, on: nextOn } : item)))
              publishCommand(control.device, nextOn ? 1 : 0, `${control.name} manual update`)
            }}
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

function AlertBanner({ onRecommendAutonomy }) {
  return (
    <section className="alert-banner">
      <AlertTriangle size={18} />
      <div>
        <strong>Temperature is slightly above the safe target.</strong>
        <p>Consider reducing fan speed or increasing shade to bring the canopy back into range.</p>
      </div>
      <button type="button" className="ghost-button" onClick={onRecommendAutonomy}>
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

function ControlsPage({ pwmValues, toggleValues, setPwmValues, setToggleValues, publishCommand }) {
  return (
    <div className="page-stack">
      <section className="page-header card">
        <div>
          <p className="eyebrow">Actuators</p>
          <h1>Manual controls</h1>
        </div>
      </section>
      <ControlPanel pwmValues={pwmValues} toggleValues={toggleValues} setPwmValues={setPwmValues} setToggleValues={setToggleValues} publishCommand={publishCommand} />
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

function SettingsPage({ environment, setEnvironment, databaseSettings, setDatabaseSettings, mqttSettings, setMqttSettings, applyMqttSettings, aiServiceSettings, setAiServiceSettings, aiKeyDraft, setAiKeyDraft, aiKeyStatus, aiKeyMessage, submitAiKeys, clearAiKeys, settingsExpanded, setSettingsExpanded, lastSyncAt }) {
  const applyPreset = (preset) => {
    setEnvironment({
      ...environment,
      activePreset: preset.id,
      plantDescription: `${preset.name} profile optimized for temperature, humidity, soil, and photoperiod control.`,
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
          <TextAreaInput
            label="Plant description"
            value={environment.plantDescription}
            onChange={(value) => setEnvironment({ ...environment, plantDescription: value })}
            placeholder="Describe the crop, growth stage, and any special conditions."
          />
        </div>

        <div className="save-bar">
          <span>Unsaved changes</span>
          <div className="save-actions">
            <button type="button" className="ghost-button" onClick={() => setEnvironment((current) => ({ ...current }))}>Discard</button>
            <button type="button" className="primary-button" onClick={() => {
              applyMqttSettings()
              setEnvironment((current) => ({ ...current }))
            }}>
              <Save size={16} />Save &amp; Apply
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="AI Provider Keys" icon={ShieldAlert} expanded={settingsExpanded.keys} onToggle={() => setSettingsExpanded((current) => ({ ...current, keys: !current.keys }))} summary="Transient, no auth required">
        <div className="environment-grid">
            <LabeledInput
              label="Companion service URL"
              value={aiServiceSettings.apiBaseUrl}
              onChange={(event) => setAiServiceSettings({ ...aiServiceSettings, apiBaseUrl: event.target.value })}
              placeholder="https://api.amrloksha151.top"
            />
          <LabeledInput
            label="Key TTL (seconds)"
            value={aiServiceSettings.ttlSeconds}
            onChange={(event) => setAiServiceSettings({ ...aiServiceSettings, ttlSeconds: Number(event.target.value) || 0 })}
            placeholder="28800"
          />
          <LabeledInput
            label="OpenAI API key"
            value={aiKeyDraft.openaiKey}
            onChange={(event) => setAiKeyDraft({ ...aiKeyDraft, openaiKey: event.target.value })}
            placeholder="sk-..."
          />
          <LabeledInput
            label="Google API key"
            value={aiKeyDraft.googleKey}
            onChange={(event) => setAiKeyDraft({ ...aiKeyDraft, googleKey: event.target.value })}
            placeholder="AIza..."
          />
        </div>
        <div className="inline-note">
          Keys are sent to the companion service only for this session and expire automatically. No auth is required for the UI.
        </div>
        {aiKeyStatus ? <div className="inline-note">{aiKeyStatus}</div> : null}
        {aiKeyMessage ? <div className="inline-note">{aiKeyMessage}</div> : null}
        <div className="save-actions">
          <button type="button" className="ghost-button" onClick={clearAiKeys}>Clear keys from service</button>
          <button type="button" className="primary-button" onClick={submitAiKeys}>Store transient keys</button>
        </div>
      </SettingsSection>

      <SettingsSection title="MQTT Broker" icon={Radio} expanded={settingsExpanded.mqtt} onToggle={() => setSettingsExpanded((current) => ({ ...current, mqtt: !current.mqtt }))} summary="Broker configured">
        <div className="environment-grid">
          <LabeledInput label="Broker host" value={mqttSettings.host} onChange={(event) => setMqttSettings({ ...mqttSettings, host: event.target.value })} placeholder="192.168.0.49" />
          <LabeledInput label="Broker port" value={mqttSettings.port} onChange={(event) => setMqttSettings({ ...mqttSettings, port: event.target.value })} placeholder="8883" />
          <LabeledInput label="WebSocket path" value={mqttSettings.path} onChange={(event) => setMqttSettings({ ...mqttSettings, path: event.target.value })} placeholder="/mqtt" />
          <LabeledInput label="Topic prefix" value={mqttSettings.topicPrefix} onChange={(event) => setMqttSettings({ ...mqttSettings, topicPrefix: event.target.value })} placeholder="greenhouse" />
        </div>
        <div className="inline-note">Connected via browser MQTT over websockets. Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'none yet'}.</div>
      </SettingsSection>

      <SettingsSection title="Neon Database" icon={Settings} expanded={settingsExpanded.database} onToggle={() => setSettingsExpanded((current) => ({ ...current, database: !current.database }))} summary="Last write: today">
        <div className="environment-grid">
          <LabeledInput label="Connection URL" value={databaseSettings.connectionUrl} onChange={(event) => setDatabaseSettings({ ...databaseSettings, connectionUrl: event.target.value })} placeholder="postgres://user:pass@host/db" />
          <LabeledInput label="Table name" value={databaseSettings.tableName} onChange={(event) => setDatabaseSettings({ ...databaseSettings, tableName: event.target.value })} placeholder="greenhouse_events" />
        </div>
        <div className="inline-note">Database writes will move through the companion service so the browser never holds the Neon password.</div>
        <div className="save-actions">
          <button type="button" className="ghost-button" onClick={async () => {
            const baseUrl = aiServiceSettings.apiBaseUrl?.trim()
            if (!baseUrl) {
              alert('Set the companion service URL in the AI Keys section first')
              return
            }

            try {
              const res = await fetch(`${baseUrl.replace(/\/$/, '')}/db/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionUrl: databaseSettings.connectionUrl })
              })
              if (!res.ok) {
                const text = await res.text()
                alert('Failed to connect: ' + text)
                return
              }
              alert('Companion service connected to DB and ensured schema.')
            } catch (err) {
              alert('Unable to reach companion service: ' + err.message)
            }
          }}>Connect companion to DB</button>
        </div>
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

function LabeledInput({ label, placeholder, value, onChange }) {
  return (
    <label className="labeled-input">
      <span>{label}</span>
      <input type="text" value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  )
}

function TextAreaInput({ label, placeholder, value, onChange }) {
  return (
    <label className="labeled-input">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
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