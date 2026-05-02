import React from 'react'
import { BrainCircuit, Loader2 } from 'lucide-react'
import { agentName } from '../lib/constants'
import { ConnectionPill } from './Layout'

export function AgentPage({ agentOutput, onAskAgri, isAgentRunning, connectionState }) {
  return (
    <section className="agent-panel card">
      <div className="agent-header">
        <div><p className="eyebrow">AI Agent</p><h1>{agentName}</h1></div>
        <ConnectionPill state={connectionState} />
      </div>
      <div className="agent-thread">
        <div className="bubble assistant">
          <p>I am {agentName}. I monitor your greenhouse and adjust conditions for optimal growth, prioritizing a cool environment.</p>
        </div>
        {agentOutput && <div className="bubble assistant"><p>{agentOutput.text}</p></div>}
      </div>
      <div className="agent-input">
        <button className="primary-button" onClick={onAskAgri} disabled={isAgentRunning} style={{ width: '100%' }}>
          {isAgentRunning ? <Loader2 size={18} className="spin" /> : <BrainCircuit size={18} />}
          Analyze and Optimize Environment
        </button>
      </div>
    </section>
  )
}
