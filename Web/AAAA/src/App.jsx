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
  
  // -- UI State --
  const [onboardingVisible, setOnboardingVisible] = useState(() => 
    readStoredValue([storageKeys.onboarding, legacyStorageKeys.onboarding]) !== 'true'
  )
  const [connectionState, setConnectionState] = useState('offline')
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [settingsExpanded, setSettingsExpanded] = useState({ 
    environment: true, keys: false, mqtt: false, database: false 
  })

  // -- Data State & Refs --
  const [sensorValues, setSensorValues] = useState(sensorDefaults)
  const [telemetryHistory, setTelemetryHistory] = useState([])
  const [pwmValues, setPwmValues] = useState(controlGroups)
  const [toggleValues, setToggleValues] = useState(toggleGroups)
  
  const latestTelemetryRef = useRef(null)

  // -- Settings State --
  const [environment, setEnvironment] = useState(() => 
    safeReadJson([storageKeys.environment, legacyStorageKeys.environment], initialEnvironment)
  )
  const environmentRef = useRef(environment)
  useEffect(() => { environmentRef.current = environment }, [environment])

  const [mqttSettings, setMqttSettings] = useState(() => 
    safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings)
  )
  const [mqttDraft, setMqttDraft] = useState(() => 
    safeReadJson([storageKeys.mqtt, legacyStorageKeys.mqtt], defaultMqttSettings)
  )
  
  const [aiSettings, setAiSettings] = useState(() => 
    safeReadJson([storageKeys.ai, legacyStorageKeys.ai], defaultAiSettings)
  )
  const aiSettingsRef = useRef(aiSettings)
  useEffect(() => { aiSettingsRef.current = aiSettings }, [aiSettings])

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

  // -- Autopilot State & Refs --
  const [autopilotStatus, setAutopilotStatus] = useState({
    temperature: { phase: 'idle', power: 0 },
    ventilation: { phase: 'idle', power: 0 },
    humidity: { phase: 'idle', power: 0 },
    soil: { phase: 'idle', power: 0 },
    light: { phase: 'idle', power: 0, gain: 0, lastCalibration: 0 }
  })
  const autopilotStatusRef = useRef(autopilotStatus)
  useEffect(() => { autopilotStatusRef.current = autopilotStatus }, [autopilotStatus])

  const analysisDataRef = useRef({
    temperature: { startTime: null, startValue: null },
    ventilation: { startTime: null, startValue: null },
    light: { ambientBaseline: null }
  })
  const lastPresetRef = useRef(environment.activePreset)

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

    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse-19207'
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
    console.log(`[MQTT] Published: ${device} = ${value} (${reason})`)
    return true
  }, [connectionState, mqttSettings.topicPrefix])

  // 4. MQTT Connection Lifecycle
  useEffect(() => {
    if (!mqttSettings.host || !mqttSettings.port) {
      const timer = window.setTimeout(() => setConnectionState('offline'), 0)
      return () => window.clearTimeout(timer)
    }

    if (mqttClientRef.current) return

    let isActive = true
    const brokerUrl = brokerUrlFromSettings(mqttSettings)
    const topicPrefix = mqttSettings.topicPrefix?.trim() || 'greenhouse-19207'
    const topics = {
      sensors: getSensorTopic(topicPrefix),
      actuators: getActuatorStateTopic(topicPrefix),
      status: getStatusTopic(topicPrefix),
    }

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
        
        // Concurrent access update
        latestTelemetryRef.current = telemetry
        
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

  // 5. AI Agent Manual Trigger
  const handleAskAgri = async () => {
    if (isAgentRunning) return
    setIsAgentRunning(true)
    try {
      const latestTelemetry = latestTelemetryRef.current
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

  // 6. Concurrent Autopilot Engine
  useEffect(() => {
    let isActive = true
    if (!aiSettings.autopilotActive || connectionState !== 'connected') return

    // Trigger full recovery on preset switch
    if (lastPresetRef.current !== environment.activePreset) {
      lastPresetRef.current = environment.activePreset
      console.log('[Autopilot] Preset switch detected, triggering recovery for all systems.')
      setAutopilotStatus(prev => ({
        ...prev,
        temperature: { phase: 'recovery', power: 100 },
        ventilation: { phase: 'recovery', power: 100 },
        humidity: { phase: 'idle', power: 0 },
        soil: { phase: 'idle', power: 0 },
        light: { phase: 'idle', power: 0, gain: 0, lastCalibration: 0 }
      }))
      publishCommand('cooling_fan', 100, 'Preset recovery', 'autopilot')
      publishCommand('ventilation_fan', 100, 'Preset recovery', 'autopilot')
    }

    const reactiveLoop = async () => {
      while (isActive) {
        const latest = latestTelemetryRef.current
        const currentEnv = environmentRef.current
        const currentAi = aiSettingsRef.current

        if (!latest) {
          await new Promise(r => setTimeout(r, 1000))
          continue
        }

        const currentStatus = autopilotStatusRef.current
        let nextStatus = { ...currentStatus }
        let changed = false

        console.log('[Autopilot] Reactive Cycle Check', { 
            temp: latest.temperature, 
            target: currentEnv.temperature.target,
            phase: currentStatus.temperature.phase 
        })

        // --- TEMPERATURE ---
        if (latest.temperature > currentEnv.temperature.max && (currentStatus.temperature.phase === 'idle' || currentStatus.temperature.phase === 'steady')) {
          nextStatus.temperature = { phase: 'recovery', power: 100 }
          publishCommand('cooling_fan', 100, 'Over temperature limit', 'autopilot')
          changed = true
        } else if (currentStatus.temperature.phase === 'recovery' && latest.temperature <= currentEnv.temperature.target) {
          nextStatus.temperature = { phase: 'analysis', power: 0 }
          analysisDataRef.current.temperature = { startTime: Date.now(), startValue: latest.temperature }
          publishCommand('cooling_fan', 0, 'Target reached, entering analysis', 'autopilot')
          changed = true
        } else if (currentStatus.temperature.phase === 'analysis') {
          const elapsed = (Date.now() - analysisDataRef.current.temperature.startTime) / 1000
          if (elapsed >= 20) {
            const rate = (latest.temperature - analysisDataRef.current.temperature.startValue) / (elapsed / 60)
            console.log(`[Autopilot] Temp Analysis Complete. Rate: ${rate.toFixed(4)} °C/min`)
            nextStatus.temperature = { phase: 'requesting_ai', power: 0 }
            setAutopilotStatus(prev => ({ ...prev, temperature: { phase: 'requesting_ai', power: 0 } }))
            try {
              const result = await runAgriAgent({
                provider: currentAi.provider, keys: currentAi.keys, telemetry: latest, environment: currentEnv,
                task: 'steady_state', context: { device: 'cooling_fan', rateOfChange: rate },
                publishCommand: (d, v, r) => publishCommand(d, v, r, 'autopilot')
              })
              setAgentOutput(result)
              const aiAction = result.actions.find(a => a.device === 'cooling_fan')
              setAutopilotStatus(prev => ({ ...prev, temperature: { phase: 'steady', power: aiAction ? aiAction.value : 0 } }))
            } catch (err) {
              console.warn('[Autopilot] AI Quota/Error, using heuristic fallback for Temp')
              const fallbackPower = Math.max(20, Math.min(100, Math.round(70 + (rate * 10))))
              publishCommand('cooling_fan', fallbackPower, 'AI Fallback (Heuristic)', 'autopilot')
              setAutopilotStatus(prev => ({ ...prev, temperature: { phase: 'steady', power: fallbackPower } }))
            }
          }
        }

        // --- VENTILATION (Interlocked with Humidity) ---
        const humidityTarget = currentEnv.humidity.target
        const isHumidityLow = latest.humidity < humidityTarget
        
        if (latest.temperature < currentEnv.temperature.min && (currentStatus.ventilation.phase === 'idle' || currentStatus.ventilation.phase === 'steady')) {
          nextStatus.ventilation = { phase: 'recovery', power: 100 }
          publishCommand('ventilation_fan', 100, 'Under temperature limit', 'autopilot')
          changed = true
        } else if (currentStatus.ventilation.phase === 'recovery' && latest.temperature >= currentEnv.temperature.target) {
          nextStatus.ventilation = { phase: 'analysis', power: 0 }
          analysisDataRef.current.ventilation = { startTime: Date.now(), startValue: latest.temperature }
          publishCommand('ventilation_fan', 0, 'Target reached, entering analysis', 'autopilot')
          changed = true
        } else if (currentStatus.ventilation.phase === 'analysis') {
          const elapsed = (Date.now() - analysisDataRef.current.ventilation.startTime) / 1000
          if (elapsed >= 20) {
            const rate = (latest.temperature - analysisDataRef.current.ventilation.startValue) / (elapsed / 60)
            nextStatus.ventilation = { phase: 'requesting_ai', power: 0 }
            setAutopilotStatus(prev => ({ ...prev, ventilation: { phase: 'requesting_ai', power: 0 } }))
            try {
              const result = await runAgriAgent({
                provider: currentAi.provider, keys: currentAi.keys, telemetry: latest, environment: currentEnv,
                task: 'steady_state', context: { device: 'ventilation_fan', rateOfChange: rate },
                publishCommand: (d, v, r) => publishCommand(d, v, r, 'autopilot')
              })
              setAgentOutput(result)
              const aiAction = result.actions.find(a => a.device === 'ventilation_fan')
              const power = isHumidityLow ? Math.min(aiAction ? aiAction.value : 0, 20) : (aiAction ? aiAction.value : 0)
              setAutopilotStatus(prev => ({ ...prev, ventilation: { phase: 'steady', power } }))
            } catch (err) {
              const fallbackPower = isHumidityLow ? 0 : 40
              publishCommand('ventilation_fan', fallbackPower, 'AI Fallback (Interlock)', 'autopilot')
              setAutopilotStatus(prev => ({ ...prev, ventilation: { phase: 'steady', power: fallbackPower } }))
            }
          }
        }

        // --- LIGHT INTENSITY (Calibration Method) ---
        const hoursSinceCalibration = (Date.now() - currentStatus.light.lastCalibration) / 3600000
        if (currentStatus.light.phase === 'idle' || hoursSinceCalibration >= 1.0) {
           console.log('[Autopilot] Starting Light Calibration Cycle...')
           nextStatus.light = { ...currentStatus.light, phase: 'measuring_ambient' }
           analysisDataRef.current.light.ambientBaseline = latest.light
           publishCommand('led_strip', 100, 'Calibration Start', 'autopilot')
           changed = true
        } else if (currentStatus.light.phase === 'measuring_ambient') {
           // We set power to 100 in previous cycle. Now measure the gain.
           const intensityAt100 = latest.light
           const ambient = analysisDataRef.current.light.ambientBaseline
           const gain = Math.max(0.1, (intensityAt100 - ambient) / 100) // Increase per 1% PWM
           console.log(`[Autopilot] Light Gain Calculated: ${gain.toFixed(2)} units/%`)
           
           nextStatus.light = { 
             phase: 'steady', 
             gain, 
             lastCalibration: Date.now(),
             power: 0 
           }
           
           // Calculate required power to hit target from current ambient
           const requiredPower = Math.max(0, Math.min(100, Math.round((currentEnv.light.target - ambient) / gain)))
           publishCommand('led_strip', requiredPower, 'Calibration Applied', 'autopilot')
           nextStatus.light.power = requiredPower
           changed = true
        } else if (currentStatus.light.phase === 'steady') {
           // Continously adjust for ambient fluctuations using measured gain
           // We can't measure ambient while ON, so we assume gain is constant and adjust from current reading
           const error = currentEnv.light.target - latest.light
           if (Math.abs(error) > 1.0) {
             const adj = error / currentStatus.light.gain
             const nextPower = Math.max(0, Math.min(100, Math.round(currentStatus.light.power + adj)))
             if (nextPower !== currentStatus.light.power) {
               publishCommand('led_strip', nextPower, 'Light tracking adjustment', 'autopilot')
               nextStatus.light.power = nextPower
               changed = true
             }
           }
        }

        // --- HUMIDITY & SOIL ---
        if (latest.humidity < currentEnv.humidity.min && currentStatus.humidity.power === 0) {
          nextStatus.humidity = { phase: 'recovering', power: 1 }
          publishCommand('mist_maker', 1, 'Below humidity limit', 'autopilot')
          changed = true
        } else if (latest.humidity >= currentEnv.humidity.target && currentStatus.humidity.power === 1) {
          nextStatus.humidity = { phase: 'idle', power: 0 }
          publishCommand('mist_maker', 0, 'Humidity target reached', 'autopilot')
          changed = true
        }

        if (latest.soil < currentEnv.soil.min && currentStatus.soil.power === 0) {
          nextStatus.soil = { phase: 'recovering', power: 1 }
          publishCommand('pump_5v', 1, 'Below soil moisture limit', 'autopilot')
          changed = true
        } else if (latest.soil >= currentEnv.soil.target && currentStatus.soil.power === 1) {
          nextStatus.soil = { phase: 'idle', power: 0 }
          publishCommand('pump_5v', 0, 'Soil target reached', 'autopilot')
          changed = true
        }

        if (changed) setAutopilotStatus(nextStatus)
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    const consultationLoop = async () => {
      while (isActive) {
        await new Promise(r => setTimeout(r, 600000)) // 10 mins
        if (!isActive) break
        const latest = latestTelemetryRef.current
        const currentEnv = environmentRef.current
        const currentAi = aiSettingsRef.current
        if (latest) {
          try {
            const result = await runAgriAgent({
              provider: currentAi.provider, keys: currentAi.keys, telemetry: latest, environment: currentEnv,
              task: 'consultation', publishCommand: (d, v, r) => publishCommand(d, v, r, 'autopilot')
            })
            setAgentOutput(result)
          } catch (err) { console.error('[Autopilot] Consultation AI Error:', err) }
        }
      }
    }

    reactiveLoop()
    consultationLoop()

    return () => { isActive = false }
  }, [aiSettings.autopilotActive, connectionState, publishCommand])

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
