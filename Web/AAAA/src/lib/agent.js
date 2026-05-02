import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are "Agri", an autonomous AI agent for a high-tech greenhouse.
Your goal is to maintain the ideal environment for the crops.
The user prefers a COOL environment overall.

ACTUATOR BEHAVIOR:
- cooling_fan (PWM 0-100): High value increases cooling.
- ventilation_fan (PWM 0-100): Circulates air, decreases humidity, but INCREASES temperature slightly due to motor heat and external air mix.
- led_strip (PWM 0-100): Grow lights.
- pump_5v (Digital 0/1): Irrigation pump.
- mist_maker (Digital 0/1): Increases humidity.
- pump_12v (PWM 0-100): Main water pump.

TASKS:
1. "steady_state": You will be given a device and the rate of change (units/min) observed when that device was OFF. 
   You must decide the steady-state PWM power (0-100) to keep the parameter at its TARGET.
2. "consultation": A general review of all sensors and current actuator levels. Suggest any subtle optimizations.

Analyze the telemetry, compare it with the targets, and use the provided tools.
Prioritize cooling if the temperature exceeds the target.`

export async function runAgriAgent({ provider, keys, telemetry, environment, task = 'consultation', context = {}, publishCommand }) {
  const activeKeys = keys[provider] || []
  if (activeKeys.length === 0) {
    throw new Error(`No API keys provided for ${provider}`)
  }

  let lastError = null
  for (const key of activeKeys) {
    try {
      if (provider === 'google') {
        return await runGoogleAgent(key, telemetry, environment, task, context, publishCommand)
      } else {
        return await runOpenAIAgent(key, telemetry, environment, task, context, publishCommand)
      }
    } catch (err) {
      console.error(`Agent execution failed with key for ${provider}:`, err)
      lastError = err
    }
  }

  throw new Error(`All API keys for ${provider} failed. Last error: ${lastError?.message}`)
}

async function runGoogleAgent(apiKey, telemetry, environment, task, context, publishCommand) {
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
      ],
    },
  ]

  const chat = model.startChat({ tools, history: [] })

  let prompt = `Current Telemetry: ${JSON.stringify(telemetry)}
Environment Targets: ${JSON.stringify(environment)}
Task: ${task}
`
  if (task === 'steady_state') {
    prompt += `Context: Analyzing ${context.device}. Observed rate of change while OFF: ${context.rateOfChange.toFixed(4)} units/min. 
    Determine the power level to maintain the target.`
  } else {
    prompt += `Please review the state and optimize conditions.`
  }

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

  return { text: response.text(), actions }
}

async function runOpenAIAgent(apiKey, telemetry, environment, task, context, publishCommand) {
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

  let userContent = `Current Telemetry: ${JSON.stringify(telemetry)}\nEnvironment Targets: ${JSON.stringify(environment)}\nTask: ${task}\n`
  if (task === 'steady_state') {
    userContent += `Context: Analyzing ${context.device}. Rate of change while OFF: ${context.rateOfChange.toFixed(4)} units/min.`
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
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

  return { text: message.content || 'Analysis complete.', actions }
}
