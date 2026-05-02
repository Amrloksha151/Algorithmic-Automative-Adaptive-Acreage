import React from 'react'
import { NavLink } from 'react-router-dom'
import { 
  Leaf, 
  Settings, 
  LayoutDashboard, 
  Gauge, 
  SlidersHorizontal, 
  BrainCircuit, 
  Cpu, 
  Loader2 
} from 'lucide-react'
import { agentName } from '../lib/constants'

const routes = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sensors', label: 'Sensors', icon: Gauge },
  { to: '/controls', label: 'Controls', icon: SlidersHorizontal },
  { to: '/agent', label: agentName, icon: BrainCircuit },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function ConnectionPill({ state }) {
  const label = state === 'connected' ? 'Connected · my-greenhouse' : state
  return (
    <button type="button" className={`connection-pill ${state}`}>
      {state === 'connecting' ? <Loader2 size={14} className="spin" /> : <span className="pill-dot" />}
      <span>{label}</span>
    </button>
  )
}

export function TopBar({ projectName, connectionState, onOpenSettings }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <Leaf size={22} className="brand-icon" />
        <div>
          <div className="brand-title">{projectName}</div>
          <div className="brand-subtitle">Fully Client-Side Greenhouse Dashboard</div>
        </div>
      </div>
      <ConnectionPill state={connectionState} />
      <button type="button" className="icon-button" onClick={onOpenSettings}><Settings size={18} /></button>
    </header>
  )
}

export function Sidebar({ connectionState }) {
  return (
    <aside className="sidebar">
      <nav className="nav-list">
        {routes.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} /><span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className={`sidebar-status ${connectionState === 'connected' ? 'online' : 'offline'}`}>
        <Cpu size={16} />
        <div>
          <div>ESP32</div>
          <strong>{connectionState === 'connected' ? 'Online' : 'Offline'}</strong>
        </div>
      </div>
    </aside>
  )
}

export function StatusBar({ connectionState, lastSyncAt }) {
  return (
    <footer className="statusbar">
      <span>Last update: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'waiting for data'}</span>
      <span>State: {connectionState}</span>
    </footer>
  )
}

export function Shell({ projectName, connectionState, onOpenSettings, children }) {
  return (
    <div className="shell">
      <TopBar projectName={projectName} connectionState={connectionState} onOpenSettings={onOpenSettings} />
      <Sidebar connectionState={connectionState} />
      <main className="main-panel">{children}</main>
    </div>
  )
}
