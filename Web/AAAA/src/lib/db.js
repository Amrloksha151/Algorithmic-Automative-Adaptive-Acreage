import { Pool } from '@neondatabase/serverless'

let pool = null
let initialized = false

export function isDbReady() {
  return initialized && pool !== null
}

export async function initDB(connectionUrl) {
  if (!connectionUrl) throw new Error('Connection URL is required')
  
  try {
    pool = new Pool({ connectionString: connectionUrl })
    const client = await pool.connect()
    try {
      // Create Telemetry table
      await client.query(`
        CREATE TABLE IF NOT EXISTS telemetry (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          temperature NUMERIC,
          humidity NUMERIC,
          soil NUMERIC,
          light NUMERIC
        );
      `)

      // Create Commands table
      await client.query(`
        CREATE TABLE IF NOT EXISTS commands (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          device TEXT,
          value NUMERIC,
          reason TEXT,
          mode TEXT,
          source TEXT
        );
      `)
      initialized = true
    } finally {
      client.release()
    }
  } catch (err) {
    initialized = false
    pool = null
    throw err
  }
}

export async function logTelemetry(data) {
  if (!initialized || !pool) return
  try {
    const client = await pool.connect()
    try {
      await client.query(
        'INSERT INTO telemetry (temperature, humidity, soil, light) VALUES ($1, $2, $3, $4)',
        [data.temperature, data.humidity, data.soil, data.light]
      )
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Failed to log telemetry to Postgres:', err)
  }
}

export async function logCommand(command) {
  if (!initialized || !pool) return
  try {
    const client = await pool.connect()
    try {
      await client.query(
        'INSERT INTO commands (device, value, reason, mode, source) VALUES ($1, $2, $3, $4, $5)',
        [command.device, command.value, command.reason, command.mode, command.source]
      )
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Failed to log command to Postgres:', err)
  }
}

export async function getTelemetryHistory(limit = 100) {
  if (!initialized || !pool) return []
  try {
    const client = await pool.connect()
    try {
      const { rows } = await client.query(
        'SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT $1',
        [limit]
      )
      return rows.map(r => ({
        ...r,
        timestamp: new Date(r.timestamp).getTime(),
        temperature: Number(r.temperature),
        humidity: Number(r.humidity),
        soil: Number(r.soil),
        light: Number(r.light)
      }))
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Failed to fetch telemetry from Postgres:', err)
    return []
  }
}
