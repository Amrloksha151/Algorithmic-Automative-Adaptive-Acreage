import { useEffect, useRef, useState, useCallback } from 'react'
import mqtt from 'mqtt'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'

// Library & Utils
import { 
  projectName, 
  agentName, 
  storageKeys, 
  legacyStorageKeys,
  defaultMqttSettings,
  defaultAiSettings,
  defaultDatabaseSettings,
  sensorDefaults,
  initialEnvironment,
  controlGroups,
  toggleGroups
} from './lib/constants'
import { 
  brokerUrlFromSettings, 
  getCommandTopic, 
  getSensorTopic, 
  getActuatorStateTopic, 
  getStatusTopic,
  safeReadJson,
  readStoredValue
} from './lib/utils'
import { logTelemetry, logCommand, getTelemetryHistory, initDB, isDbReady } from './lib/db'
import { runAgriAgent } from './lib/agent'

// Components
import { Shell, StatusBar } from './components/Layout'
import { DashboardPage } from './components/Dashboard'
import { SensorsPage } from './components/Sensors'
import { ControlsPage } from './components/Controls'
import { AgentPage } from './components/Agent'
import { SettingsPage } from './components/Settings'
import { OnboardingFlow } from './components/Onboarding'

function App() {
  const navigate = useNavigate()
  const mqttClientRef = useRef(null)
  const autopilotTimerRef = useRef(null)

  // -- UI State --
  const [onboardingVisible, setOnboardingVisible] = useState(() => 
    readStoredValue([storageKeys.onboarding, legacyStorageKeys.onboarding]) !== 'true'
  )
  const [connectionState, setConnectionState] = useState('offline')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [settingsExpanded, setSettingsExpanded] = useState({ 
    environment: true, keys: false, mqtt: false, database: false 
  })

  // -- Data State --
  const [sensorValues, setSensorValues] = useState(sensorDefaults)
  const [telemetryHistory, setTelemetryHistory] = useState([])
  const [pwmValues, setPwmValues] = useState(controlGroups)
  const [toggleValues, setToggleValues] = useState(toggleGroups)

  // -- Settings State --
  const [environment, setEnvironment] = useState(() => 
    safeReadJson([storageKeys.environment, legacyStorageKeys.environment], initialEnvironment)
  )
  const [mqttSettings, setMqttSettings] = useState(() => 
    safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings)
  )
  const [mqttDraft, setMqttDraft] = useState(() => 
    safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings)
  )
  const [aiSettings, setAiSettings] = useState(() => 
    safeReadJson([storageKeys.ai, legacyStorageKeys.ai], defaultAiSettings)
  )
  const [databaseSettings, setDatabaseSettings] = useState(() => 
    safeReadJson([storageKeys.database, legacyStorageKeys.database], defaultDatabaseSettings)
  )
  const [databaseDraft, setDatabaseDraft] = useState(() => 
    safeReadJson([storageKeys.database, legacyStorageKeys.database], defaultDatabaseSettings)
  )
  const [dbInitialized, setDbInitialized] = useState(false)

  // -- AI Agent State --
  const [agentOutput, setAgentOutput] = useState(null)
  const [isAgentRunning, setIsAgentRunning] = useState(false)

  // 1. Persistence Effects
  useEffect(() => { window.localStorage.setItem(storageKeys.environment, JSON.stringify(environment)) }, [environment])
  useEffect(() => { window.localStorage.setItem(storageKeys.mqtt, JSON.stringify(mqttSettings)) }, [mqttSettings])
  useEffect(() => { window.localStorage.setItem(storageKeys.ai, JSON.stringify(aiSettings)) }, [aiSettings])
  useEffect(() => { window.localStorage.setItem(storageKeys.database, JSON.stringify(databaseSettings)) }, [databaseSettings])

  // 2. Database Connection Effect
  useEffect(() => {
    if (databaseSettings.connectionUrl) {
      initDB(databaseSettings.connectionUrl)
        .then(() => {
          setDbInitialized(true)
          return getTelemetryHistory(50)
        })
        .then(history => setTelemetryHistory(history.reverse()))
        .catch(err => {
          console.error('Initial DB Connect Error:', err)
          setDbInitialized(false)
        })
    }
  }, [databaseSettings.connectionUrl])

  // 3. MQTT Command Publisher
  const publishCommand = useCallback((device, value, reason, mode = 'manual') => {
    const client = mqttClientRef.current
    if (!client || connectionState !== 'connected') return false

    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse'
    const command = {
      device,
      value,
      reason,
      mode,
      source: 'web-ui',
      timestamp: new Date().toISOString(),
    }
    client.publish(getCommandTopic(topicPrefix), JSON.stringify(command))
    if (isDbReady()) logCommand(command)
    setLastSyncAt(new Date().toISOString())
    return true
  }, [connectionState, mqttSettings.topicPrefix])

  // 4. MQTT Connection Lifecycle
  useEffect(() => {
    if (!mqttSettings.host || !mqttSettings.port) {
      const timer = window.setTimeout(() => setConnectionState('offline'), 0)
      return () => window.clearTimeout(timer)
    }

    // Singleton check: If we already have a client, don't start another
    if (mqttClientRef.current) return

    let isActive = true
    const brokerUrl = brokerUrlFromSettings(mqttSettings)
    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse'
    const topics = {
      sensors: getSensorTopic(topicPrefix),
      actuators: getActuatorStateTopic(topicPrefix),
      status: getStatusTopic(topicPrefix),
    }

    // Settling delay: wait for browser/React to stabilize before connecting
    const connectTimer = window.setTimeout(() => {
      if (!isActive) return
      setConnectionState('connecting')

      const client = mqtt.connect(brokerUrl, {
        username: mqttSettings.username || undefined,
        password: mqttSettings.password || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        wsOptions: { protocols: ['mqtt'] },
        transformWsUrl: (url) => url,
      })
      mqttClientRef.current = client

      const handleUpdate = (snapshot) => {
        if (!isActive || !snapshot || typeof snapshot !== 'object') return
        const telemetry = {
          temperature: snapshot.temperature,
          humidity: snapshot.humidity,
          soil: snapshot.soil,
          light: snapshot.light,
        }
        if (isDbReady()) logTelemetry(telemetry)
        setTelemetryHistory(prev => [...prev.slice(-49), { ...telemetry, timestamp: Date.now() }])
        setSensorValues(prev => prev.map(s => snapshot[s.key] != null ? { ...s, value: Number(snapshot[s.key]) } : s))
        if (snapshot.actuators) {
          setPwmValues(prev => prev.map(c => typeof snapshot.actuators[c.device] === 'number' ? { ...c, value: snapshot.actuators[c.device] } : c))
          setToggleValues(prev => prev.map(c => typeof snapshot.actuators[c.device] === 'number' ? { ...c, on: Boolean(snapshot.actuators[c.device]) } : c))
        }
      }

      client.on('connect', () => {
        if (!isActive) return
        setConnectionState('connected')
        client.subscribe([topics.sensors, topics.actuators, topics.status])
        setLastSyncAt(new Date().toISOString())
      })

      client.on('message', (topic, payload) => {
        if (!isActive) return
        const text = payload.toString()
        if (topic === topics.status) {
          setConnectionState(text === 'online' ? 'connected' : 'offline')
        } else {
          try { handleUpdate(JSON.parse(text)) } catch { handleUpdate({}) }
        }
        setLastSyncAt(new Date().toISOString())
      })

      client.on('close', () => { if (isActive) setConnectionState('offline') })
      client.on('error', () => { if (isActive) setConnectionState('offline') })
    }, 100)

    return () => {
      isActive = false
      window.clearTimeout(connectTimer)
      if (mqttClientRef.current) {
        mqttClientRef.current.end()
        mqttClientRef.current = null
      }
    }
  }, [mqttSettings])

  // 5. AI Agent Logic
  const handleAskAgri = async () => {
    if (isAgentRunning) return
    setIsAgentRunning(true)
    try {
      const latestTelemetry = telemetryHistory[telemetryHistory.length - 1]
      const result = await runAgriAgent({
        provider: aiSettings.provider,
        keys: aiSettings.keys,
        telemetry: latestTelemetry,
        environment,
        publishCommand: (d, v, r) => publishCommand(d, v, r, 'autonomous')
      })
      setAgentOutput(result)
    } catch (error) {
      alert(error.message)
    } finally {
      setIsAgentRunning(false)
    }
  }

  // 6. Autopilot Cycle
  useEffect(() => {
    if (aiSettings.autopilotActive && connectionState === 'connected') {
      const runCycle = async () => {
        const latestTelemetry = telemetryHistory[telemetryHistory.length - 1]
        if (!latestTelemetry) return
        try {
          await runAgriAgent({
            provider: aiSettings.provider,
            keys: aiSettings.keys,
            telemetry: latestTelemetry,
            environment,
            publishCommand: (d, v, r) => publishCommand(d, v, r, 'autopilot')
          })
        } catch (err) { console.error('Autopilot Cycle Error:', err) }
      }

      autopilotTimerRef.current = setInterval(runCycle, 60000)
      return () => clearInterval(autopilotTimerRef.current)
    }
  }, [aiSettings.autopilotActive, connectionState, environment, aiSettings.keys, aiSettings.provider, publishCommand, telemetryHistory])

  // 7. DB Initialization Handler
  const handleInitDB = async () => {
    if (!databaseDraft.connectionUrl) return
    try {
      await initDB(databaseDraft.connectionUrl)
      setDatabaseSettings(databaseDraft)
      setDbInitialized(true)
      alert('Neon Database connected and schema ensured successfully!')
    } catch (err) {
      alert('Database Connection Failed: ' + err.message)
      setDbInitialized(false)
    }
  }

  return (
    <div className="app-shell">
      <Shell 
        projectName={projectName} 
        connectionState={connectionState} 
        onOpenSettings={() => navigate('/settings')}
      >
        <Routes>
          <Route path="/" element={
            <DashboardPage
              sensorValues={sensorValues}
              pwmValues={pwmValues}
              toggleValues={toggleValues}
              setPwmValues={setPwmValues}
              setToggleValues={setToggleValues}
              publishCommand={publishCommand}
              agentOutput={agentOutput}
              isAgentRunning={isAgentRunning}
              onAskAgri={handleAskAgri}
              aiSettings={aiSettings}
              setAiSettings={setAiSettings}
              connectionState={connectionState}
            />
          } />
          <Route path="/sensors" element={<SensorsPage telemetryHistory={telemetryHistory} />} />
          <Route path="/controls" element={
            <ControlsPage 
              pwmValues={pwmValues} 
              toggleValues={toggleValues} 
              setPwmValues={setPwmValues} 
              setToggleValues={setToggleValues} 
              publishCommand={publishCommand} 
            />
          } />
          <Route path="/agent" element={
            <AgentPage 
              agentOutput={agentOutput} 
              onAskAgri={handleAskAgri} 
              isAgentRunning={isAgentRunning} 
              connectionState={connectionState}
            />
          } />
          <Route path="/settings" element={
            <SettingsPage
              environment={environment} setEnvironment={setEnvironment}
              mqttSettings={mqttDraft} setMqttSettings={setMqttDraft} applyMqttSettings={() => setMqttSettings(mqttDraft)}
              aiSettings={aiSettings} setAiSettings={setAiSettings}
              databaseSettings={databaseDraft} setDatabaseSettings={setDatabaseDraft} onInitDB={handleInitDB} dbInitialized={dbInitialized}
              settingsExpanded={settingsExpanded} setSettingsExpanded={setSettingsExpanded}
            />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <StatusBar connectionState={connectionState} lastSyncAt={lastSyncAt} />
      {onboardingVisible && (
        <OnboardingFlow onFinish={() => { 
          window.localStorage.setItem(storageKeys.onboarding, 'true'); 
          setOnboardingVisible(false) 
        }} />
      )}
    </div>
  )
}

export default App
