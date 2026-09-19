---
name: Precision Telemetry Console
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#dbc1b4'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#a38c80'
  outline-variant: '#554339'
  surface-tint: '#ffb68c'
  primary: '#ffb68c'
  on-primary: '#532200'
  primary-container: '#d97736'
  on-primary-container: '#491d00'
  inverse-primary: '#994703'
  secondary: '#c2c6d4'
  on-secondary: '#2b313b'
  secondary-container: '#444954'
  on-secondary-container: '#b3b8c6'
  tertiary: '#c1c6d7'
  on-tertiary: '#2b303d'
  tertiary-container: '#8c91a1'
  on-tertiary-container: '#252a37'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbc9'
  primary-fixed-dim: '#ffb68c'
  on-primary-fixed: '#321200'
  on-primary-fixed-variant: '#753400'
  secondary-fixed: '#dee2f0'
  secondary-fixed-dim: '#c2c6d4'
  on-secondary-fixed: '#161c25'
  on-secondary-fixed-variant: '#424752'
  tertiary-fixed: '#dee2f3'
  tertiary-fixed-dim: '#c1c6d7'
  on-tertiary-fixed: '#161b28'
  on-tertiary-fixed-variant: '#414754'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
typography:
  headline-xl:
    fontFamily: Chivo
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Chivo
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Chivo
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  metric-display:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 36px
    letterSpacing: -0.03em
  metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.02em
  metric-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  data-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.04em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-lg: 1rem
  margin: 1rem
  margin-lg: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for industrial hardware telematics, electrical grid diagnostics, and high-reliability IoT hardware monitoring. The target audience comprises electrical engineers, field instrumentation technicians, and industrial facilities operators who require sustained, low-fatigue monitoring under high cognitive loads.

The design movement is **Industrial Precision Instrument**—a functionalist philosophy informed by modern lab test equipment (oscilloscopes, power analyzers, rack-mount controllers) and mission-critical SCADA interfaces. It explicitly avoids consumer SaaS tropes: no diffused glow effects, no decorative purple/cyan linear gradients, no translucent glass panels, and no rounded pill buttons. Every surface, line, and value exists to convey operational state and physical truth. 

The aesthetic treats the monitor as a calibrated physical hardware console:
- Structural framing via precise 1px rectilinear dividers.
- Dense tabular information architecture prioritized over decorative whitespace.
- Low visual fatigue through deep graphite layers, calm status indicators, and deliberate contrast management.
- Complete focus on operational telemetry: voltage, amperage, harmonic distortion, thermal dissipation, and relay state.

## Colors

The system employs a calibrated dark-mode hierarchy based on warm graphite and carbon alloys. Dark mode is permanent; light mode is absent to prevent eye fatigue in low-light industrial NOCs and control rooms.

### Surface System
- **Canvas Base (`#121316`)**: Deep warm off-black. Used for the viewport backdrop and unpanelled zones.
- **Surface Level 1 (`#1a1b1f`)**: Machine panel base. Houses primary module grids, table containers, and dock bars.
- **Surface Level 2 (`#22242a`)**: Elevated chassis cells. Used for nested telemetry readouts, input field fills, and modal dialogues.
- **Surface Level 3 (`#2a2d35`)**: Hover interactions and active channel backings.
- **Border Subtle (`#2e313a`)**: 1px framing lines separating adjacent panels and module zones.
- **Hairline / Separator (`#383c47`)**: Internal partition lines within data tables, channel dividers, and tick marks.

### Text & Telemetry Readouts
- **High-Contrast Primary (`#f4f4f6`)**: Absolute readout values, major headers, critical telemetry figures, and active states.
- **Secondary Muted (`#9da2af`)**: Parameter labels, measurement units (V, A, kW, Hz, °C), column headers, and active toggle markers.
- **Tertiary Subdued (`#686d7c`)**: Inactive channel slots, timestamp metadata, device serial indices, and baseline grid ticks.

### Signal & State Accents (Restrained & Functional)
- **Instrument Amber (`#d97736` / Hover `#e0833a`)**: Reserved strictly for active channel selection, focus rings, cursor markers, and primary hardware control toggles.
- **Status Nominal (`#16a34a` / Text `#22c55e`)**: Calm, industrial olive-tinged green. Indicates energized lines, closed contacts, and healthy operational loops. Never neon.
- **Status Caution / Approaching Limit (`#d97706` / Text `#f59e0b`)**: Warm industrial amber. Indicates thermal warning, load variance, or approaching circuit trip limits.
- **Status Critical / Overload (`#dc2626` / Text `#ef4444`)**: Restrained industrial crimson. Indicates breaker trip, ground fault, phase mismatch, or offline emergency shutoff.
- **Status Offline / Dormant (`#4b5262` / Text `#9da2af`)**: Neutral muted slate. Indicates de-energized hardware and unassigned telemetry channels.

## Typography

The typographic stack balances industrial mechanical clarity with high tabular density. 

### Font Roles
- **Chivo** acts as the structural panel header font. Its architectural cut and clean geometric proportions ground modules without distracting from real-time data streams.
- **Inter** provides neutral, invisible legibility for descriptions, metadata lists, system logs, form labels, and configuration guides. It must always be configured with `font-feature-settings: 'cv05', 'cv08', 'tnum'` to lock numeral alignment.
- **JetBrains Mono** governs all numerical telemetry readouts, units, register maps, timestamps, IP addresses, and state codes. Tabular lining numbers (`tnum`) must remain strictly enforced across all weights to prevent layout twitching during live-cycle data refreshes.

### Hierarchy Rules
- All labels and descriptors paired with telemetry metrics must use uppercase tracking (`label-caps` or `data-mono-xs`) in secondary gray (`#9da2af`).
- Metric units (e.g., `VAC`, `kW·h`, `mA`, `Hz`) must be placed adjacent to values using a step-down mono weight in secondary gray, never merged directly into the metric integer.

## Layout & Spacing

This design system uses a modular rack-mount grid structure designed for compact space efficiency and real-time scanning.

### Layout Philosophy
- **Modular Fluid Grid**: The screen is broken down into persistent technical instrumentation bays (Sidebar/Nav, Telemetry Strip, Center Primary Bay, Diagnostics Utility Tray).
- **Density Over Space**: Padding is calculated to optimize information density while preventing misclicks. Vertical spacing between related data items uses `space-xs` (4px) or `space-sm` (8px); panel perimeter padding relies strictly on `space-md` (12px) or `space-lg` (16px).
- **Alignment**: Every element adheres strictly to an 8px baseline grid with 4px sub-increments for compact telemetry tags and inline indicators.

### Responsive Breakpoints & Multi-Monitor Rules
- **Console Desktop (≥1440px)**: 12 or 16-column continuous fluid layout. Multi-bay multi-channel display, telemetry stream tables, and concurrent real-time charts. Gutters locked to `1rem` (16px).
- **Field Terminal / Laptop (1024px – 1439px)**: 12-column grid. Diagnostic utility tray snaps into collapsible drawer; secondary metrics move into tabbed bays. Gutters locked to `0.75rem` (12px).
- **Mobile / Handheld Field Tool (<1023px)**: Single-column linear chassis stack. Secondary tables collapse into stacked key-value blocks. Hardware switches and breakers enlarge touch targets to a minimum of 40px while maintaining tight visual bounds via subtle borders.

## Elevation & Depth

Visual hierarchy is constructed strictly through **tonal layering and hairline framing**, never through ambient drop shadows or floating elevations.

### Elevation Layers
- **Floor (Canvas)**: `#121316`. The base structure of the operating system.
- **Chassis Base (Panels / Shelves)**: `#1a1b1f`, framed with a continuous 1px solid border of `#2e313a`.
- **Nested Card / Metric Wells**: `#22242a`, recessed visually into the panel with a 1px border of `#2e313a` or `#383c47`.
- **Interactive / Focus Surfaces**: `#2a2d35`, triggered on hover or active slot selection.

### Shadow Policy
- **No Drop Shadows**: Standard cards, buttons, and panels have zero box-shadows (`box-shadow: none`). Floating cards disrupt the physical hardware metaphor.
- **Inset Wells**: Recessed terminal viewports, log consoles, and input fields use an interior edge shadow: `inset 0 1px 2px rgba(0, 0, 0, 0.45)`.
- **Flyout / Popover Panels**: Only used for critical breaker confirmations or context menus. Layered with `box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65)` accompanied by a sharp 1px border in `#383c47`.

## Shapes

The shape vocabulary communicates precision machining, cold-rolled chassis fabrication, and electrical component tooling.

### Geometry Rules
- **Corner Curvature**: Default radius is locked to `0.25rem` (4px). This applies to cards, telemetry cells, input fields, and buttons. It softens pixel-harshness without yielding to casual consumer roundness.
- **Strict Rectilinear Exceptions (`0px`)**: Live continuous oscillographs, data grid tables, status strip ribbons, and divider rules use zero radius (`rounded-none`).
- **Internal Elements**: Checkbox markers, radio indicators, and status pips use micro-radii (`2px`) or calibrated circular geometric forms (`50%` reserved strictly for LEDs and round contact indicators).

## Components

### Buttons & Hardware Actuators
- **Primary Action (Commit / Calibrate / Execute)**: Surface `#d97736`, text `#121316` (bold), 1px solid `#e0833a`. Hover: `#e0833a`. Active: Inset press effect. Border radius: 4px. Height: 32px (compact) or 36px (standard).
- **Secondary Action (Neutral / Inspect)**: Surface `#22242a`, text `#f4f4f6`, 1px solid `#383c47`. Hover: `#2a2d35` with border `#9da2af`.
- **Destructive / Trip Breaker**: Surface `#22242a`, text `#ef4444`, 1px solid `#dc2626`. Hover: surface `#dc2626`, text `#f4f4f6`.
- **Toggle / Machine Switch**: Recessed track (`#121316`, 1px border `#383c47`), mechanical rocker block (`#2e313a` off, `#d97736` on). No pill-shaped bubble switches.

### Status Indicators & Annunciator LEDs
- Miniature hardware LEDs: 6px × 6px geometric pips with a 1px halo ring (`box-shadow: 0 0 0 1px #1a1b1f`).
- Green (`#22c55e`): Normal energized circuit.
- Amber (`#f59e0b`): Warning / thermal threshold.
- Red (`#ef4444`): Breaker open / fault / trip.
- Gray (`#4b5262`): Channel offline / standby.
- The pip is immediately followed by a monospace label in uppercase (`data-mono-xs`).

### Data Readout Cards & Metric Wells
- 1px solid `#2e313a` wrapper on `#1a1b1f` surface.
- Card Header: Compact 28px height, bottom border 1px solid `#2e313a`, containing uppercase parameter label (`label-caps`) in `#9da2af` and channel address in `#686d7c`.
- Metric Value: Large monospace integer (`metric-display` or `metric-lg`) in `#f4f4f6`, right-aligned or paired with engineering unit in `#9da2af`.
- Sparkline / Pulse: Embedded hairline wave (1px stroke) anchored directly to the bottom border without padding.

### Telemetry Tables
- Striped or bordered rows: Row height 28px (compact) to 32px (standard).
- Header row: Surface `#16171b`, bottom border 1px solid `#383c47`, text in `#9da2af`, uppercase 10px monospace (`data-mono-xs`).
- Row hover: `#22242a`. Active/Selected row: left accent border 2px solid `#d97736`, background `#1f2127`.
- All numerical data right-aligned using tabular figures (`tnum`).

### Input Fields & Parameter Steppers
- Height: 30px. Surface `#16171b` with inset border `#2e313a`.
- Typography: `JetBrains Mono` 12px, text `#f4f4f6`.
- Focus State: 1px continuous solid border `#d97736` with zero outer fuzzy glow.
- Inline Units: Affixed to the right edge (e.g., `Hz`, `ms`, `V`) in `#686d7c`.

### Selection Controls
- **Checkboxes**: 14px × 14px square, radius 2px, surface `#16171b`, border 1px solid `#383c47`. Checked: Background `#d97736`, border `#d97736`, checkmark mark in `#121316`.
- **Segmented Mode Switchers**: Rectilinear button bars bounded by a single outer border `#2e313a`. Internal segments divided by 1px hairlines. Active segment uses background `#2e313a`, text `#f4f4f6`, with an active 2px bottom indicator in `#d97736`.