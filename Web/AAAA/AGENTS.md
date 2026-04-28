# 🌿 Greenhouse Dashboard — UI Specification (AGENT.md)

> **Scope**: UI only. Agent logic, MQTT handling, Gemini tool execution, and database queries are implemented separately. This document specifies every screen, component, layout, interaction, and visual detail the AI co-programmer must implement.

---

## 1. Aesthetic Direction

### Theme: *"Living Lab"*
Organic meets precision. Think a botanist's field journal crossed with a modern sensor dashboard — warm earth tones, lush greens, with clinical data readouts. The UI should feel like it's *alive*: breathing animations, soft pulsing indicators, subtle organic textures layered under crisp data.

### Palette (CSS Variables)

```css
:root {
  /* Backgrounds */
  --bg-base:        #0f1a0e;   /* deep forest night */
  --bg-surface:     #162218;   /* card/panel background */
  --bg-elevated:    #1e2e1d;   /* hover / elevated surface */
  --bg-overlay:     #243325;   /* modal backdrop surface */

  /* Greens — primary brand */
  --green-900:      #14401a;
  --green-700:      #1e6b28;
  --green-500:      #2d9e3a;   /* primary action */
  --green-300:      #5fcf6e;   /* accent / highlight */
  --green-100:      #aff0b8;   /* text on dark green */

  /* Earth tones — secondary */
  --earth-700:      #5c3d1e;
  --earth-500:      #8b5e34;
  --earth-300:      #c4935a;   /* warm accent */
  --earth-100:      #f0d4b0;

  /* Data colors — sensor readings */
  --sensor-temp:    #f97316;   /* orange — temperature */
  --sensor-humid:   #38bdf8;   /* sky blue — humidity */
  --sensor-soil:    #a78bfa;   /* violet — soil moisture */
  --sensor-light:   #fbbf24;   /* amber — light intensity */

  /* Status */
  --status-ok:      #22c55e;
  --status-warn:    #f59e0b;
  --status-danger:  #ef4444;
  --status-offline: #6b7280;

  /* Text */
  --text-primary:   #e8f5e9;
  --text-secondary: #9ab89d;
  --text-muted:     #5a7a5d;

  /* Borders */
  --border-subtle:  rgba(93, 175, 100, 0.12);
  --border-active:  rgba(93, 175, 100, 0.35);

  /* Effects */
  --glow-green:     0 0 24px rgba(45, 158, 58, 0.3);
  --glow-warm:      0 0 24px rgba(196, 147, 90, 0.2);
}
```

### Typography

```css
/* Display / headings */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');

/* Body / data */
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');

/* UI labels / buttons */
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap');

--font-display: 'Playfair Display', serif;      /* headings, hero numbers */
--font-mono:    'DM Mono', monospace;            /* sensor values, timestamps */
--font-ui:      'Instrument Sans', sans-serif;  /* labels, buttons, nav */
```

### Background Texture
Apply a subtle noise grain overlay on `--bg-base` using an SVG filter or CSS `background-image` with a very low opacity SVG noise texture. Add a radial gradient "light bloom" in the center of the page — a soft `--green-900` glow fading to `--bg-base`.

---

## 2. Application Layout

### Shell Structure

```
┌─────────────────────────────────────────────────────┐
│  TopBar                                             │
│  [🌿 Logo + Name]     [Status Pill]   [⚙ Settings] │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │  Main Content Area                       │
│ (nav)    │  (changes per route)                     │
│          │                                          │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│  StatusBar — last update timestamp + broker URL     │
└─────────────────────────────────────────────────────┘
```

- **TopBar**: fixed, 56px height, `--bg-surface` with bottom border `--border-subtle`
- **Sidebar**: 220px wide, collapsible to 56px icon-only mode on smaller screens
- **Main Content**: scrollable, padding `24px`
- **StatusBar**: fixed bottom, 32px, small mono text

### Routes / Pages

| Route | Page |
|---|---|
| `/` | Dashboard (sensor overview + quick controls) |
| `/sensors` | Sensor History (charts) |
| `/controls` | Manual Controls |
| `/agent` | AI Agent Chat |
| `/settings` | Configuration |

---

## 3. Components

---

### 3.1 TopBar

**Left**: Leaf icon (Lucide `Leaf`, `--green-300`, 22px) + text `"Algorithmic Automative Adaptive Acreage"` in `--font-display` size `1.2rem` color `--text-primary`

**Center**: `ConnectionStatusPill` component (see §3.10)

**Right**:
- Notification bell icon (`Bell`, Lucide) — badge dot if any alert
- Settings gear icon (`Settings`, Lucide) — opens Settings modal
- Both icons: `--text-secondary`, hover `--green-300`, 20px, transition `color 200ms`

---

### 3.2 Sidebar

Navigation items with Lucide icons:

| Icon | Label | Route |
|---|---|---|
| `LayoutDashboard` | Dashboard | `/` |
| `Activity` | Sensors | `/sensors` |
| `SlidersHorizontal` | Controls | `/controls` |
| `BrainCircuit` | AI Agent | `/agent` |
| `Settings` | Settings | `/settings` |

**Active state**: left border `3px solid --green-500`, background `--bg-elevated`, text `--green-300`

**Inactive**: text `--text-secondary`, hover background `--bg-elevated` with `200ms` ease

**Bottom of sidebar**: small card showing ESP32 online/offline with a `Cpu` icon

---

### 3.3 SensorCard

Used on Dashboard and Sensors pages. Shows a single sensor reading.

```
┌─────────────────────────────┐
│  [icon]   TEMPERATURE       │
│                             │
│      26.4°                  │  ← large mono display font
│                             │
│  ████████░░  72%            │  ← thin progress bar
│  ↑ 0.3° from last reading   │  ← delta indicator
└─────────────────────────────┘
```

**Props interface** (for co-programmer reference):
```typescript
interface SensorCardProps {
  type: 'temperature' | 'humidity' | 'soil' | 'light'
  value: number | '--'
  unit: string
  delta?: number          // change from previous reading
  min: number
  max: number
  status: 'ok' | 'warn' | 'danger' | 'offline'
}
```

**Visual details**:
- Card background: `--bg-surface`, border `1px solid --border-subtle`
- Border radius: `16px`
- On hover: border `--border-active`, subtle `--glow-green` box-shadow
- Icon color matches sensor data color variable
- Value: `--font-mono`, `3rem`, `font-weight: 500`, color matches sensor type
- Unit: `1rem`, `--text-muted`
- Progress bar: thin `4px`, rounded, background `--bg-elevated`, fill matches sensor color
- Delta: green arrow up / red arrow down with `TrendingUp` / `TrendingDown` Lucide icons, `0.75rem`
- **Pulse animation** when value updates: brief glow flash on the value text, `400ms`
- If `status === 'offline'`: overlay a semi-transparent wash, show `WifiOff` icon centered
- **Environment threshold indicator**: if the parent passes `envMin` and `envMax` props, show a small marker on the progress bar at those positions (two thin `--status-warn` tick marks). This visually shows where the current reading sits relative to the configured target range. If value is outside the env range, the progress bar fill color shifts from the sensor color to `--status-warn` or `--status-danger`.

**Four sensor types and their colors**:
- `temperature` → `--sensor-temp` + `Thermometer` icon
- `humidity` → `--sensor-humid` + `Droplets` icon
- `soil` → `--sensor-soil` + `Sprout` icon
- `light` → `--sensor-light` + `Sun` icon

---

### 3.4 SensorGrid

Dashboard layout for four sensor cards:

```
┌──────────┬──────────┐
│   Temp   │ Humidity │
├──────────┼──────────┤
│   Soil   │  Light   │
└──────────┴──────────┘
```

- CSS Grid: `grid-template-columns: repeat(2, 1fr)` on desktop, `1fr` on mobile
- Gap: `16px`

---

### 3.5 ControlPanel

Manual device controls. Two visual groups:

**PWM Controls** (fans + LED strip) — use a custom `SliderControl` component:

```
┌──────────────────────────────────────────┐
│  [Fan] Cooling Fan              80%      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░   │
│                                          │
│  [Wind] Ventilation Fan         50%      │
│  ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░   │
│                                          │
│  [Sun] LED Grow Light           65%      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░   │
└──────────────────────────────────────────┘
```

Slider styling:
- Track height: `6px`, background `--bg-elevated`, border-radius `3px`
- Fill: gradient from `--green-700` to `--green-300`
- Thumb: `18px` circle, `--green-300`, box-shadow `--glow-green`
- Value badge: pill to the right, mono font, `--bg-overlay`

**Toggle Controls** (pump, irrigation, mist) — use `ToggleControl` component:

```
┌──────────────────────────────────────────┐
│  [Droplets]  Irrigation Pump      [●  ] │
│  [Waves]     Mist Maker           [ ●] │
│  [Zap]       12V Water Pump       [●  ] │
└──────────────────────────────────────────┘
```

Toggle styling:
- Width: `44px`, height: `24px`
- OFF: background `--bg-elevated`, thumb `--text-muted`
- ON: background `--green-500`, thumb white, glow `--glow-green`
- Transition: `300ms` spring-like

Each control row also shows last-command timestamp in `--text-muted` mono font.

**Auto Mode Banner** — shown at top of ControlPanel when AI agent auto-mode is on:
```
┌──────────────────────────────────────────────────┐
│  🤖  AI Auto-Control is active                   │
│  Manual overrides will pause auto-control        │
│                                           [Pause] │
└──────────────────────────────────────────────────┘
```
Background: `--green-900`, border `--border-active`, icon `BrainCircuit`

---

### 3.6 AgentChatPanel

Full-page chat interface on `/agent` route.

**Layout**:
```
┌────────────────────────────────────────┐
│  Agent Status Bar                      │
│  [●] Gemini 2.0 Flash  |  Key: •••xyz │
├────────────────────────────────────────┤
│                                        │
│  Message Thread (scrollable)           │
│                                        │
│  [user bubble]                         │
│              [assistant bubble]        │
│  [tool call card]                      │
│              [assistant bubble]        │
│                                        │
├────────────────────────────────────────┤
│  [🌿] Type a command...    [Send ↵]   │
└────────────────────────────────────────┘
```

**Message bubbles**:
- User: right-aligned, background `--green-900`, border `--border-active`, border-radius `16px 16px 4px 16px`
- Assistant: left-aligned, background `--bg-surface`, border `--border-subtle`, border-radius `16px 16px 16px 4px`
- Font: `--font-ui`, `0.9rem`, line-height `1.6`
- Timestamp: `--font-mono`, `0.7rem`, `--text-muted`

**Tool Call Card** — shown inline when agent calls a tool:
```
┌──────────────────────────────────┐
│  ⚙  Calling: get_sensors        │
│  ───────────────────────────    │
│  → {temperature: 26.4, ...}     │
└──────────────────────────────────┘
```
- Background: `--bg-overlay`, border-left `3px solid --earth-300`
- Collapsible — click to expand/collapse result JSON
- Icon: `Wrench` (Lucide), `--earth-300`
- Animate in with a slide-down + fade

**Typing indicator** — three dots bouncing animation while agent is thinking

**Input bar**:
- Background: `--bg-surface`, border `--border-subtle`
- Focus: border `--green-500`, glow `--glow-green`
- Send button: `--green-500` background, `ArrowRight` icon, disabled when empty
- Keyboard: `Enter` sends, `Shift+Enter` newline

**Suggested prompts** — shown when chat is empty:
```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  "Check all sensors and adjust  │  │  "It's night — dim lights and   │
│   to ideal conditions"          │  │   reduce ventilation"           │
└─────────────────────────────────┘  └─────────────────────────────────┘
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  "Is the soil moisture okay     │  │  "Give me a full status         │
│   for tomatoes?"                │  │   report"                       │
└─────────────────────────────────┘  └─────────────────────────────────┘
```
Cards: `--bg-surface`, hover `--bg-elevated`, border `--border-subtle`, border-radius `12px`, `--font-ui` italic `--text-secondary`

---

### 3.7 SensorHistoryChart

On `/sensors` route. Time-series line chart per sensor.

- Use **Recharts** (`npm install recharts`)
- One chart per sensor, stacked vertically
- Chart background: transparent
- Grid lines: `--border-subtle`, dashed
- Line color: matches sensor color variable
- Area fill: gradient from sensor color at `0.3` opacity to transparent
- Tooltip: `--bg-overlay` background, mono font, rounded `8px`
- X-axis: `--font-mono` `0.7rem`, `--text-muted`
- Y-axis: same
- Time range selector above charts: `[1H]  [6H]  [24H]  [7D]` pill buttons
  - Active: `--green-500` background, white text
  - Inactive: `--bg-elevated`, `--text-secondary`

---

### 3.8 Settings Page (`/settings`)

Three sections, each in a card with `--bg-surface` background:

---

#### Section A: API Keys

Header: `Key` icon (Lucide) + "Gemini API Keys"

Sub-header text: *"Add multiple keys — the app will automatically fall back to the next key if one fails or hits a rate limit."*

Key list (each row):
```
┌──────────────────────────────────────────────────────┐
│  Key #1  [●  Active]                                 │
│  AIza••••••••••••••••••xyz        [Copy] [Delete]   │
├──────────────────────────────────────────────────────┤
│  Key #2  [○  Standby]                                │
│  AIza••••••••••••••••••abc        [Copy] [Delete]   │
└──────────────────────────────────────────────────────┘
[+ Add API Key]
```

- Show only last 3 chars of key, rest masked with `•`
- Active key: green dot + `--status-ok` label
- Standby: gray dot
- Failed/exhausted: red dot + `--status-danger` label "Rate limited"
- Drag handle (`GripVertical` icon) for reordering key priority
- `[+ Add API Key]` button: dashed border `--border-active`, `--green-300` text, `Plus` icon

**Add Key modal** (inline expand, not a separate modal):
```
┌────────────────────────────────────┐
│  Paste your Gemini API Key         │
│  [                              ]  │
│  Get a free key at aistudio.google │
│                  [Cancel] [Save]   │
└────────────────────────────────────┘
```

---

#### Section B: MQTT Broker

Header: `Radio` icon + "MQTT Broker"

```
WebSocket URL
[ws://broker.hivemq.com:8884/mqtt        ]

Topic Prefix
[greenhouse                               ]

Username (optional)
[                                         ]

Password (optional)
[                                         ]

                              [Test Connection]
```

`[Test Connection]` button behavior:
- Loading: spinner + "Connecting…"
- Success: `CheckCircle` icon green + "Connected!"
- Fail: `XCircle` icon red + error message

Below the form, show small info card:
```
┌──────────────────────────────────────────────────────┐
│  💡 Free brokers                                     │
│  HiveMQ:  ws://broker.hivemq.com:8884/mqtt         │
│  EMQX:    ws://broker.emqx.io:8084/mqtt            │
│  Local:   ws://YOUR_PC_IP:8883                      │
└──────────────────────────────────────────────────────┘
```

---

#### Section C: Database

Header: `Database` icon + "Neon Database"

```
PostgreSQL Connection URL
[postgres://user:pass@host/db            ] [👁]

                              [Test Connection]
```

Eye icon toggles URL masking.

Below: small status showing last successful write timestamp.

---

#### Section D: Environment Settings

Header: `Leaf` icon + "Grow Environment"

Sub-header text: *"Define your target growing conditions. The AI agent will use these thresholds to make decisions and trigger alerts."*

---

##### D.1 Preset Selector

Shown at the very top of this section, before any parameters. A horizontally scrollable row of preset cards:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CROP PRESET                                                        │
│                                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──  │
│  │    🍅     │  │    🥬     │  │    🌿     │  │    🫑     │  │ +  │
│  │ Tomatoes  │  │  Lettuce  │  │   Herbs   │  │ Peppers   │  │    │
│  │ ● Active  │  │           │  │           │  │           │  │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  └──  │
└─────────────────────────────────────────────────────────────────────┘
```

**Preset card visual**:
- Size: `100px × 100px`, border-radius `14px`
- Background: `--bg-elevated`, border `1px solid --border-subtle`
- Emoji: `2rem`, centered top area
- Name: `--font-ui`, `0.8rem`, `--text-secondary`, centered
- **Active/selected**: border `2px solid --green-500`, background `--green-900`, glow `--glow-green`, "● Active" label in `--green-300` `0.65rem` mono at bottom
- Hover: `translateY(-3px)`, border `--border-active`, `200ms` ease
- Last card `[+]`: dashed border `--border-active`, `Plus` icon `--green-300`, label "Custom", clicking it creates a new custom preset and enters edit mode

**Built-in presets and their default values**:

| Preset | Emoji | Temp (°C) | Humidity (%) | Soil (%) | Light (mol/m²/d) | Photoperiod (hr) |
|---|---|---|---|---|---|---|
| Tomatoes | 🍅 | 20–25 | 60–70 | 55–70 | 18–20 | 14 |
| Lettuce | 🥬 | 15–20 | 60–75 | 50–65 | 15–17 | 14 |
| Herbs | 🌿 | 18–24 | 55–70 | 45–65 | 16–18 | 14 |
| Peppers | 🫑 | 20–25 | 55–70 | 50–70 | 18–20 | 14 |
| Seedlings | 🌱 | 20–25 | 65–75 | 55–70 | 15–17 | 16 |

When a preset is selected, all parameter controls below **animate to the new values** — sliders slide, numbers count up/down, `400ms` ease. A toast notification appears: *"Tomatoes preset applied — review and save"*

---

##### D.2 Parameter Controls

Below the preset row, six parameter controls stacked in a two-column grid on desktop, single column on mobile.

Each parameter uses a **`RangeParameterControl`** component (double-handle range slider for min/max) except Photoperiod and Planted Area which use single-value inputs.

---

**`RangeParameterControl` component spec:**

```
┌──────────────────────────────────────────────────────┐
│  [icon]  TEMPERATURE                    [Reset ↺]   │
│                                                      │
│          15°C ◄━━━━[●══════●]━━━━► 25°C            │
│               │                   │                  │
│             Min                  Max                 │
│          [  15  ]             [  25  ]               │
│                                                      │
│  System range: 15 – 25 °C     ⚠ At limit            │
└──────────────────────────────────────────────────────┘
```

**Dual-handle slider mechanics**:
- Track: `8px` height, `--bg-elevated`, border-radius `4px`
- Active range fill (between the two handles): gradient `--green-700` → `--green-300`
- Out-of-range fill (beyond handles on either side): `--bg-elevated`
- Handle: `22px` circle, white border `2px solid --green-500`, background `--bg-surface`, box-shadow `--glow-green`
- Handles must not cross — enforce min ≤ max with a `4px` minimum gap
- Dragging a handle: scale up to `1.2×`, shadow intensifies, `150ms` spring
- **Inline number inputs** below each handle — typing directly updates the slider position
- Number inputs: `48px` wide, `--font-mono`, `0.9rem`, `--bg-elevated`, border `--border-subtle`, border-radius `8px`, center-aligned text
- `[Reset ↺]` button top-right: `RotateCcw` icon, `--text-muted`, hover `--green-300`, resets to preset/default value with animation

**Status indicator below slider** (replaces generic system range text with contextual feedback):
- Within optimal range: `CheckCircle` icon `--status-ok` + "Within safe range"
- Near boundary (within 10% of limit): `AlertTriangle` icon `--status-warn` + "Near limit"
- At/beyond boundary: `AlertCircle` icon `--status-danger` + "At system limit"
- Show the absolute hardware system range in `--text-muted` mono: e.g. `System: 15–25 °C`

---

**The six parameters:**

**1. Temperature**
- Icon: `Thermometer`, `--sensor-temp`
- System range: `15°C – 25°C`
- Default: min `18°C`, max `24°C`
- Unit: `°C`
- Step: `0.5`

**2. Humidity**
- Icon: `Droplets`, `--sensor-humid`
- System range: `50% – 75%`
- Default: min `60%`, max `75%`
- Unit: `%`
- Step: `1`

**3. Soil Moisture**
- Icon: `Sprout`, `--sensor-soil`
- System range: `40% – 75%`
- Default: min `50%`, max `70%`
- Unit: `%`
- Step: `1`

**4. Light Intensity (PAR)**
- Icon: `Sun`, `--sensor-light`
- System range: `15 – 20 mol/m²/day`
- Default: min `16`, max `18`
- Unit: `mol/m²/d`
- Step: `0.5`
- Helper text below: *"PAR = Photosynthetically Active Radiation. 1 mol/m²/day ≈ 11.6 µmol/m²/s continuous."*
- This helper text is `--text-muted`, `0.75rem`, italic, shown below the control

**5. Photoperiod**
- Icon: `Clock`, `--earth-300` (warm accent — it's a schedule, not a sensor)
- This is a **single value** input (not range), since photoperiod is one number
- System range: `12 – 16 hours/day`
- Default: `14`
- Unit: `hrs/day`
- Component: `SingleValueControl` — a single large centered slider with one handle + numeric input
- Below the slider: a visual **day/night arc diagram** (see §D.3)

**6. Planted Area**
- Icon: `SquareDashedBottom` (or `Grid2x2`), `--earth-300`
- This is a **single numeric input only** — no slider, just a large well-styled input field
- Unit: `m²`
- Placeholder: `e.g. 4.0`
- Range hint: `0.1 – 500 m²`
- Helper text: *"Used by the AI agent to calculate total water and nutrient requirements."*
- Below the input: a live calculated display:

```
┌──────────────────────────────────────────────────────┐
│  At 4.0 m² with current light settings:             │
│  Daily light dose   →   72 mol/day total             │
│  Est. water need    →   ~4.8 L/day                   │
└──────────────────────────────────────────────────────┘
```
Background: `--bg-overlay`, border-left `3px solid --earth-300`, border-radius `8px`, `--font-mono` `0.8rem`, `--text-secondary`. Updates live as area or light settings change.

---

##### D.3 Day/Night Arc Diagram

Shown below the Photoperiod slider. A simple SVG arc visualization:

```
          ☀ Day  (14h)
        ╭──────────╮
       ╱            ╲
      │              │
       ╲            ╱
        ╰──────────╯
          ☾ Night (10h)
```

- SVG, `200px × 100px`, centered
- Upper arc: `--sensor-light` color, stroke `3px` — represents light-on hours
- Lower arc: `--bg-elevated` color, stroke `3px` — represents dark hours
- ☀ label with hours on top, ☾ label with hours on bottom
- Arc proportions update live as photoperiod slider moves
- Smooth arc morph animation when value changes, `300ms` ease

---

##### D.4 Save & Apply Bar

Sticky bar at the bottom of Section D (not the whole settings page):

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠ Unsaved changes                                          │
│                              [Discard]  [Save & Apply]      │
└──────────────────────────────────────────────────────────────┘
```

- Only visible when there are **unsaved changes** (compare current form state to saved state)
- Background: `--bg-overlay`, border-top `--border-active`
- `[Discard]`: `--text-secondary`, hover `--status-danger`
- `[Save & Apply]`: `--green-500` background, `Save` icon + text
- On save: button shows spinner → then `CheckCircle` icon + "Saved!" for `1.5s` → returns to normal
- The AI agent store must be notified on save (prop/callback, not implemented here)

---

##### D.5 Custom Preset Management

When user clicks `[+]` in the preset row:

1. A new card appears with a text input for the preset name and an emoji picker (simple grid of 12 plant-related emojis: 🌱🌿🍅🥬🫑🌾🌻🍓🫐🥦🌶️🫚)
2. All parameter controls are unlocked for free editing beyond preset defaults
3. A `[Save as Preset]` button appears above the Save & Apply bar
4. Saved custom presets appear in the preset row with a small `✏` edit icon and `✕` delete icon on hover

Custom preset cards: same visual as built-in but with a subtle `--earth-300` border tint to distinguish them.

---

### 3.9 ConnectionStatusPill

Shown in TopBar center.

States:

| State | Visual |
|---|---|
| `connected` | `●` green dot + "Connected · my-greenhouse" in `--font-mono` |
| `connecting` | Spinning `Loader2` icon + "Connecting…" `--status-warn` |
| `reconnecting` | Pulsing dot + "Reconnecting…" `--status-warn` |
| `disconnected` | `●` gray + "Offline" |
| `error` | `●` red + "Error" |

Pill background: `--bg-elevated`, border `--border-subtle`, border-radius `999px`, padding `4px 12px`

Click on pill → opens MQTT settings section of Settings page

---

### 3.10 AlertBanner

Shown at top of Dashboard when a sensor is out of range.

```
┌─────────────────────────────────────────────────────┐
│  ⚠  Temperature is 31°C — above safe range (28°C)  │
│     AI Agent can auto-correct →  [Ask Agent]   [✕] │
└─────────────────────────────────────────────────────┘
```

- Background: `--status-warn` at `0.1` opacity, border-left `3px solid --status-warn`
- Multiple alerts stack vertically
- `[Ask Agent]` button routes to `/agent` with pre-filled message
- Animate in: slide down + fade, animate out: slide up + fade

---

### 3.11 OnboardingFlow

Shown on first visit (no config in localStorage).

Full-screen overlay with a centered card, three steps:

**Step 1 — Welcome**
```
        🌿
   Welcome to Algorithmic Automative Adaptive Acreage

   A smart greenhouse dashboard powered
   by AI. Let's get you connected.

        [Get Started →]
```
Large `Leaf` icon, `--green-300`, 64px
Title: `--font-display`, `2rem`

**Step 2 — Connect MQTT**
Same as Settings Section B form, but in wizard style.
Progress indicator: `● ● ○` at top

**Step 3 — Add Gemini Key**
Same as Settings Section A add-key form.
Progress indicator: `● ● ●`
Final button: `[Launch Dashboard]` — `--green-500` background, full width

Wizard card: `--bg-surface`, `max-width: 480px`, centered, border `--border-active`, border-radius `20px`, `--glow-green` box-shadow

---

## 4. Page Specifications

---

### 4.1 Dashboard (`/`)

Layout (desktop):
```
┌─────────────────────────────────────────────────────┐
│  [Alert banners if any]                             │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  SensorGrid  │  ControlPanel                        │
│  (2×2)       │  (PWM sliders + toggles)             │
│              │                                      │
├──────────────┴──────────────────────────────────────┤
│  Quick Agent Bar                                    │
│  [🤖 Ask the AI agent…]              [Open Agent →]│
└─────────────────────────────────────────────────────┘
```

**Quick Agent Bar**: `--bg-surface`, border-top `--border-subtle`, 56px height. Clicking the input field routes to `/agent`.

---

### 4.2 Sensors (`/sensors`)

```
┌─────────────────────────────────────────────────────┐
│  [1H] [6H] [24H] [7D]          Last update: 14:32  │
├─────────────────────────────────────────────────────┤
│  Temperature Chart                                  │
├─────────────────────────────────────────────────────┤
│  Humidity Chart                                     │
├─────────────────────────────────────────────────────┤
│  Soil Moisture Chart                                │
├─────────────────────────────────────────────────────┤
│  Light Intensity Chart                              │
└─────────────────────────────────────────────────────┘
```

Each chart card: `--bg-surface`, `border-radius: 16px`, height `200px`

---

### 4.3 Controls (`/controls`)

```
┌─────────────────────────────────────────────────────┐
│  [Auto Mode Banner if active]                       │
├──────────────────┬──────────────────────────────────┤
│  PWM Controls    │  Toggle Controls                 │
│  ─ Cooling Fan   │  ─ Irrigation Pump               │
│  ─ Vent Fan      │  ─ Mist Maker                    │
│  ─ LED Strip     │  ─ 12V Pump                      │
└──────────────────┴──────────────────────────────────┘
```

---

### 4.4 Agent (`/agent`)

Full-height `AgentChatPanel` (§3.6). No other content.

---

### 4.5 Settings (`/settings`)

Four stacked section cards, in this order:
1. **Environment Settings** (§3.8 Section D) — placed first, most frequently visited
2. **API Keys** (§3.8 Section A)
3. **MQTT Broker** (§3.8 Section B)
4. **Database** (§3.8 Section C)

Each section card is independently collapsible — click the header to expand/collapse. Default: Environment Settings expanded, others collapsed (except first-time setup where all are expanded).

Collapsed header shows active context at a glance:
```
┌──────────────────────────────────────────────────────┐
│  [icon]  Environment Settings     [Tomatoes 🍅]  [▼] │
└──────────────────────────────────────────────────────┘
```

Global save button at bottom: `[Save All Changes]`, `--green-500`, full width. Section D has its own sticky save bar (§3.8 D.4) — the global button covers API keys, MQTT, and database only.

---

## 5. Micro-interactions & Animation

| Trigger | Animation |
|---|---|
| Sensor value updates | Value fades out → fades in new value, `300ms` |
| Device toggle ON | Toggle slides right, glow appears, `300ms` spring |
| New chat message | Slides up + fades in from bottom, `250ms` |
| Tool call card appears | Slides down + fades in, `200ms` |
| Alert banner appears | Slides down from top, `300ms` ease-out |
| Alert banner dismissed | Slides up + fades out, `200ms` |
| Card hover | Border brightens, very subtle lift (`translateY(-2px)`), `200ms` |
| Connection status change | Pill background color cross-fades, `500ms` |
| Page route change | Outgoing page fades + slides left, incoming slides from right, `250ms` |
| Onboarding step advance | Card content slides left out, new content slides in from right |
| Settings save success | Brief green flash on button + checkmark icon swap, `600ms` |
| Preset selected | All sliders animate to new values simultaneously, `400ms` ease; toast appears |
| Range slider handle drag | Handle scales to `1.2×`, glow intensifies, arc diagram morphs live |
| Photoperiod changes | Day/night arc redraws proportions, `300ms` ease |
| Planted area input changes | Calculated values (water/light) count up/down to new numbers, `400ms` |
| Section card collapse | Content slides up and fades, chevron rotates `180°`, `250ms` |
| Unsaved changes bar appears | Slides up from bottom of section card, `200ms` ease-out |
| Custom preset saved | New card slides into preset row from right, `300ms` spring |
| SensorCard — value outside env range | Card border pulses `--status-warn` or `--status-danger`, `1s` ease infinite |

---

## 6. Responsive Breakpoints

| Breakpoint | Layout change |
|---|---|
| `< 768px` (mobile) | Sidebar collapses to bottom tab bar, SensorGrid becomes 1 column, ControlPanel stacks vertically |
| `768px–1024px` (tablet) | Sidebar collapses to icon-only (56px), Dashboard grid adjusts |
| `> 1024px` (desktop) | Full sidebar (220px), all multi-column layouts active |

---

## 7. Empty & Loading States

**Loading (initial data fetch)**:
- SensorCard: skeleton shimmer animation (`--bg-elevated` base, animated gradient sweep)
- Charts: skeleton bar at chart height

**No data / offline**:
- SensorCard: `WifiOff` icon + "Waiting for ESP32…" in `--text-muted`
- Charts: empty state illustration — a simple SVG of a small plant with "No data yet" caption

**Agent — no API key**:
- Chat area replaced with centered card: `Key` icon + "Add a Gemini API key in Settings to enable the AI agent" + `[Go to Settings]` button

---

## 8. Component File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── TopBar.jsx
│   │   ├── Sidebar.jsx
│   │   └── StatusBar.jsx
│   ├── sensors/
│   │   ├── SensorCard.jsx
│   │   ├── SensorGrid.jsx
│   │   └── SensorHistoryChart.jsx
│   ├── controls/
│   │   ├── ControlPanel.jsx
│   │   ├── SliderControl.jsx
│   │   └── ToggleControl.jsx
│   ├── agent/
│   │   └── AgentChatPanel.jsx
│   ├── shared/
│   │   ├── ConnectionStatusPill.jsx
│   │   ├── AlertBanner.jsx
│   │   └── OnboardingFlow.jsx
│   └── settings/
│       ├── ApiKeysSection.jsx
│       ├── MqttSection.jsx
│       ├── DatabaseSection.jsx
│       └── environment/
│           ├── EnvironmentSection.jsx      ← parent, holds preset + params
│           ├── PresetSelector.jsx          ← horizontal scrollable preset cards
│           ├── RangeParameterControl.jsx   ← dual-handle slider + inputs
│           ├── SingleValueControl.jsx      ← single-handle slider (photoperiod)
│           ├── PlantedAreaInput.jsx        ← numeric input + live calc display
│           └── DayNightArcDiagram.jsx      ← SVG arc visualization
├── pages/
│   ├── Dashboard.jsx
│   ├── Sensors.jsx
│   ├── Controls.jsx
│   ├── Agent.jsx
│   └── Settings.jsx
├── hooks/          ← implemented separately (not UI scope)
├── tools/          ← implemented separately (not UI scope)
└── store/          ← implemented separately (not UI scope)
```

---

## 9. Tailwind Config Notes

The co-programmer should extend Tailwind with the CSS variables above. Add to `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      'bg-base':     'var(--bg-base)',
      'bg-surface':  'var(--bg-surface)',
      'green-brand': 'var(--green-500)',
      'green-accent':'var(--green-300)',
      'earth':       'var(--earth-300)',
      // etc.
    },
    fontFamily: {
      display: ['Playfair Display', 'serif'],
      mono:    ['DM Mono', 'monospace'],
      ui:      ['Instrument Sans', 'sans-serif'],
    },
    boxShadow: {
      'glow-green': 'var(--glow-green)',
      'glow-warm':  'var(--glow-warm)',
    },
    borderColor: {
      subtle: 'var(--border-subtle)',
      active: 'var(--border-active)',
    }
  }
}
```

---

## 10. Dependencies

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "recharts": "^2",
    "mqtt": "^5",
    "@google/genai": "latest",
    "lucide-react": "latest",
    "zustand": "^4",
    "clsx": "^2"
  },
  "devDependencies": {
    "tailwindcss": "^3",
    "vite": "^5"
  }
}
```

---

## 11. What Is NOT In Scope for UI

The following are **not** the UI co-programmer's responsibility:

- `hooks/useMQTT.js` — MQTT connection logic
- `hooks/useGemini.js` — Gemini agentic loop
- `tools/greenhouse.js` — tool definitions and executors
- `store/connectionStore.js` — Zustand state (only the shape is defined above)
- Any actual API calls or data fetching
- Database queries

The UI receives data via **props and store selectors only**. All async logic lives in hooks.

The environment settings store shape (for reference when wiring props — implementation not in scope):

```typescript
interface EnvironmentSettings {
  activePreset: string                // preset id or 'custom'
  temperature:  { min: number, max: number }   // °C, range 15–25
  humidity:     { min: number, max: number }   // %, range 50–75
  soil:         { min: number, max: number }   // %, range 40–75
  light:        { min: number, max: number }   // mol/m²/d, range 15–20
  photoperiod:  number                         // hours/day, range 12–16
  plantedArea:  number                         // m²
  customPresets: CustomPreset[]
}

interface CustomPreset {
  id:          string
  name:        string
  emoji:       string
  temperature: { min: number, max: number }
  humidity:    { min: number, max: number }
  soil:        { min: number, max: number }
  light:       { min: number, max: number }
  photoperiod: number
}
```

---

*End of AGENT.md*