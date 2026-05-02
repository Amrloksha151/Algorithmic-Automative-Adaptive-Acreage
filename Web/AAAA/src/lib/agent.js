import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are "Agri", an autonomous AI agent for a high-tech greenhouse.
Your goal is to maintain the ideal environment for the crops.
The user prefers a COOL environment overall.

You have access to real-time sensor data and can control the following actuators:
- cooling_fan (PWM 0-100): High value increases cooling and ventilation.
- ventilation_fan (PWM 0-100): Increases air circulation.
- led_strip (PWM 0-100): Grow lights.
- pump_5v (Digital 0/1): Irrigation pump.
- mist_maker (Digital 0/1): Increases humidity.
- pump_12v (PWM 0-100): Main water pump for cooling/irrigation.

Analyze the telemetry, compare it with the target ranges, and use the provided tools to adjust the greenhouse state.
Prioritize cooling if the temperature exceeds the target.
Always provide a reason for your actions.
If everything is within range, you can choose to do nothing or make subtle optimizations.`

export async function runAgriAgent({ provider, keys, telemetry, environment, publishCommand }) {
  const activeKeys = keys[provider] || []
  if (activeKeys.length === 0) {
    throw new Error(`No API keys provided for ${provider}`)
  }

  let lastError = null
  for (const key of activeKeys) {
    try {
      if (provider === 'google') {
        return await runGoogleAgent(key, telemetry, environment, publishCommand)
      } else {
        return await runOpenAIAgent(key, telemetry, environment, publishCommand)
      }
    } catch (err) {
      console.error(`Agent execution failed with key for ${provider}:`, err)
      lastError = err
      // Continue to next key
    }
  }

  throw new Error(`All API keys for ${provider} failed. Last error: ${lastError?.message}`)
}

async function runGoogleAgent(apiKey, telemetry, environment, publishCommand) {
  const genAI = new GoogleGenAI({ apiKey })
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  })

  const tools = [
    {
      functionDeclarations: [
        {
          name: 'update_actuator',
          description: 'Adjust a greenhouse actuator (fan, pump, light, etc.)',
          parameters: {
            type: 'object',
            properties: {
              device: { type: 'string', description: 'The device ID (e.g., cooling_fan, pump_5v)' },
              value: { type: 'number', description: 'The value to set (0-100 for PWM, 0 or 1 for Digital)' },
              reason: { type: 'string', description: 'Detailed reason for this adjustment' },
            },
            required: ['device', 'value', 'reason'],
          },
        },
      ],
    },
  ]

  const chat = model.startChat({
    tools,
    history: [],
  })

  const prompt = `Current Telemetry: ${JSON.stringify(telemetry)}
Environment Targets: ${JSON.stringify(environment)}
Please review the state and take necessary actions.`

  const result = await chat.sendMessage(prompt)
  const response = await result.response
  const calls = response.functionCalls()

  const actions = []
  if (calls) {
    for (const call of calls) {
      if (call.name === 'update_actuator') {
        const { device, value, reason } = call.args
        const success = publishCommand(device, value, reason)
        actions.push({ device, value, reason, success })
      }
    }
  }

  return {
    text: response.text(),
    actions,
  }
}

async function runOpenAIAgent(apiKey, telemetry, environment, publishCommand) {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

  const tools = [
    {
      type: 'function',
      function: {
        name: 'update_actuator',
        description: 'Adjust a greenhouse actuator',
        parameters: {
          type: 'object',
          properties: {
            device: { type: 'string' },
            value: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['device', 'value', 'reason'],
        },
      },
    },
  ]

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Current Telemetry: ${JSON.stringify(telemetry)}\nEnvironment Targets: ${JSON.stringify(environment)}` },
    ],
    tools,
  })

  const message = response.choices[0].message
  const actions = []

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.function.name === 'update_actuator') {
        const { device, value, reason } = JSON.parse(toolCall.function.arguments)
        const success = publishCommand(device, value, reason)
        actions.push({ device, value, reason, success })
      }
    }
  }

  return {
    text: message.content || 'Adjustments made based on current conditions.',
    actions,
  }
}
