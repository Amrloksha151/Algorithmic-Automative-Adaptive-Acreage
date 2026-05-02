import React, { useState } from 'react'
import { Leaf } from 'lucide-react'
import { projectName } from '../lib/constants'

export function OnboardingFlow({ onFinish }) {
  const [step, setStep] = useState(1)
  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card card">
        <div className="stepper">{[1, 2, 3].map(i => <span key={i} className={i <= step ? 'active' : ''} />)}</div>
        {step === 1 && (
          <div className="onboarding-step">
            <Leaf size={56} className="brand-icon hero" />
            <h2>Welcome to {projectName}</h2>
            <p>A fully client-side greenhouse dashboard.</p>
            <button className="primary-button" onClick={() => setStep(2)}>Next</button>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-step">
            <h2>Remote Persistence</h2>
            <p>All your sensor data is synced to your own Neon Postgres database.</p>
            <button className="primary-button" onClick={() => setStep(3)}>Next</button>
          </div>
        )}
        {step === 3 && (
          <div className="onboarding-step">
            <h2>Add Your Gemini Key</h2>
            <p>Provide at least one Google Gemini API key to enable Agri's intelligence.</p>
            <button className="primary-button" onClick={onFinish}>Launch</button>
          </div>
        )}
      </div>
    </div>
  )
}
