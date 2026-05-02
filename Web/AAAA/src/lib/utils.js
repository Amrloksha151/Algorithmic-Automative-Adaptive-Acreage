export function brokerUrlFromSettings(settings) {
  // Firefox's WebSocket parser is stricter than Chrome's. It rejects:
  //   1. Any whitespace anywhere in the URL (host, port, path)
  //   2. An empty-string resource path — must be "/" at minimum, never ""
  //   3. A port value that is not a clean integer string
  //   4. Fragments (#) or query strings (?…) in the WebSocket URL
  // All four are silently accepted by Chrome but hard-fail in Firefox with
  // "The connection to wss://… was interrupted while the page was loading."
  
  // Strict protocol mapping
  const protocol = settings.protocol === 'ws' ? 'ws' : 'wss'
  const host = String(settings.host || '').trim()
  const port = String(settings.port || '').trim()

  // Normalise path — empty string is invalid in Firefox WebSocket URLs
  let rawPath = String(settings.path || '').trim()
  if (rawPath === '') {
    rawPath = '/mqtt'
  } else if (!rawPath.startsWith('/')) {
    rawPath = '/' + rawPath
  }
  
  // Strip any fragment or query that may have been accidentally pasted in
  const safePath = rawPath.split('#')[0].split('?')[0]

  const portSegment = port ? ':' + port : ''
  const finalUrl = protocol + '://' + host + portSegment + safePath
  
  console.log('[MQTT] Generated Broker URL:', finalUrl)
  return finalUrl
}

export const getCommandTopic = (prefix) => `${prefix}/commands`
export const getSensorTopic = (prefix) => `${prefix}/sensors`
export const getActuatorStateTopic = (prefix) => `${prefix}/actuators/state`
export const getStatusTopic = (prefix) => `${prefix}/status`

export function readStoredValue(keys) {
  if (typeof window === 'undefined') return null
  try {
    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) return raw
    }
  } catch { return null }
  return null
}

export function safeReadJson(keys, fallback) {
  const raw = readStoredValue(Array.isArray(keys) ? keys : [keys])
  if (!raw) return fallback
  try { return { ...fallback, ...JSON.parse(raw) } } catch { return fallback }
}
