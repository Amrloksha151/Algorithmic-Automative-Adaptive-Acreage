export const projectName = 'Algorithmic Automative Adaptive Acreage'
export const agentName = 'Agri'
export const storagePrefix = 'algorithmic-automative-adaptive-acreage'

export const legacyStorageKeys = {
  environment: 'aaaa-environment-settings',
  mqtt: 'aaaa-mqtt-settings',
  ai: 'aaaa-ai-settings',
  database: 'aaaa-database-settings',
  onboarding: 'aaaa-onboarding-complete',
}

export const storageKeys = {
  environment: `${storagePrefix}-environment-settings`,
  mqtt: `${storagePrefix}-mqtt-settings`,
  ai: `${storagePrefix}-ai-settings`,
  database: `${storagePrefix}-database-settings`,
  onboarding: `${storagePrefix}-onboarding-complete`,
}

export const defaultMqttSettings = {
  protocol: 'ws',
  host: '192.168.0.49',
  port: '8883',
  path: '/mqtt',
  topicPrefix: 'greenhouse',
  username: '',
  password: '',
}

export const defaultAiSettings = {
  provider: 'google',
  keys: {
    google: [],
    openai: [],
  },
  autopilotActive: false,
}

export const defaultDatabaseSettings = {
  connectionUrl: '',
}

export const actuatorMap = {
  cooling_fan: 'Cooling Fan',
  ventilation_fan: 'Ventilation Fan',
  led_strip: 'LED Grow Light',
  pump_5v: 'Irrigation Pump',
  mist_maker: 'Mist Maker',
  pump_12v: '12V Water Pump',
}

export const sensorMeta = {
  temperature: { label: 'Temperature', unit: '°C', color: 'var(--sensor-temp)' },
  humidity: { label: 'Humidity', unit: '%', color: 'var(--sensor-humid)' },
  soil: { label: 'Soil', unit: '%', color: 'var(--sensor-soil)' },
  light: { label: 'Light', unit: 'mol/m²/d', color: 'var(--sensor-light)' },
}

export const sensorDefaults = [
  { key: 'temperature', value: 24.6, min: 15, max: 25, delta: 0.4, status: 'warn', envMin: 20, envMax: 24 },
  { key: 'humidity', value: 66, min: 50, max: 75, delta: -1.2, status: 'ok', envMin: 60, envMax: 72 },
  { key: 'soil', value: 58, min: 40, max: 75, delta: 1.8, status: 'ok', envMin: 55, envMax: 68 },
  { key: 'light', value: 17.3, min: 15, max: 20, delta: -0.5, status: 'warn', envMin: 16, envMax: 18 },
]

export const greenhousePresets = [
  { id: 'tomatoes', name: 'Tomatoes', emoji: '🍅' },
  { id: 'lettuce', name: 'Lettuce', emoji: '🥬' },
  { id: 'herbs', name: 'Herbs', emoji: '🌿' },
]

export const envPresets = [
  { id: 'tomatoes', name: 'Tomatoes', emoji: '🍅', temp: [20, 25], humidity: [60, 70], soil: [55, 70], light: [18, 20], photoperiod: 14 },
  { id: 'lettuce', name: 'Lettuce', emoji: '🥬', temp: [15, 20], humidity: [60, 75], soil: [50, 65], light: [15, 17], photoperiod: 14 },
  { id: 'herbs', name: 'Herbs', emoji: '🌿', temp: [18, 24], humidity: [55, 70], soil: [45, 65], light: [16, 18], photoperiod: 14 },
]

export const initialEnvironment = {
  activePreset: 'tomatoes',
  plantDescription: 'Warm-season fruiting crop with high light demand.',
  temperature: { min: 20, max: 25 },
  humidity: { min: 60, max: 70 },
  soil: { min: 55, max: 70 },
  light: { min: 18, max: 20 },
  photoperiod: 14,
  plantedArea: 4,
}

export const controlGroups = [
  { name: 'Cooling Fan', device: 'cooling_fan', iconName: 'Zap', value: 0 },
  { name: 'Ventilation Fan', device: 'ventilation_fan', iconName: 'MoonStar', value: 0 },
  { name: 'LED Grow Light', device: 'led_strip', iconName: 'SunMedium', value: 0 },
  { name: '12V Water Pump', device: 'pump_12v', iconName: 'Cpu', value: 0 },
]

export const toggleGroups = [
  { name: 'Irrigation Pump', device: 'pump_5v', iconName: 'Droplets', on: false },
  { name: 'Mist Maker', device: 'mist_maker', iconName: 'WifiOff', on: false },
]
