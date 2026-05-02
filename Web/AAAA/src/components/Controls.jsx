import React from 'react'
import { ControlPanel } from './Dashboard'

export function ControlsPage({ pwmValues, toggleValues, setPwmValues, setToggleValues, publishCommand }) {
  return (
    <div className="page-stack">
      <section className="page-header card">
        <h1>Manual Actuators</h1>
        <p>Direct control of fans, pumps, and lights</p>
      </section>
      <ControlPanel 
        pwmValues={pwmValues} 
        toggleValues={toggleValues} 
        setPwmValues={setPwmValues} 
        setToggleValues={setToggleValues} 
        publishCommand={publishCommand} 
      />
    </div>
  )
}
