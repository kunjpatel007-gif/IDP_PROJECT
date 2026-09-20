# CHANGES

What this codebase is, relative to the original `CLAUDE_FRONTEND_PROMPT.md` build and
the `index.html` / `DESIGN.md` prototype. Read this first if you have been editing your
own copy — several files were renamed or deleted and the design tokens were re-pointed.

---

## 1. Colour: now exactly the DESIGN.md ramp

The palette had drifted from the template. Every token and every hardcoded hex in the
canvas and SVG components was re-pointed to the design system's own values.

| Role | Was | Now |
|---|---|---|
| Surface Level 1 (panels) | `#1a1b20` | `#1a1b1f` |
| Surface Level 2 (nested wells) | *absent* | `#22242a` (`surface-well`) |
| Surface Level 3 (hover) | `#212228` | `#2a2d35` |
| Table header / input fill | `#16171c` | `#16171b` |
| Border Subtle | `#292a32` | `#2e313a` |
| Hairline / Separator | `#353742` | `#383c47` |
| Text primary | `#e4e5ea` | `#f4f4f6` |
| Text secondary | `#9699a6` | `#9da2af` |
| Text tertiary | `#696c7a` | `#686d7c` |
| Status Critical | `#f87171` | `#ef4444` / deep `#dc2626` |
| Status Caution | *absent* | `#f59e0b` / deep `#d97706` (`accent-amber`) |
| Status Offline | `#4b4e5c` | `#4b5262` (`accent-offline`) |

Instrument Amber (`#d97736`, hover `#e0833a`) and Status Nominal (`#22c55e` / `#16a34a`)
were already correct.

Also brought to spec: annunciator LEDs now carry the 1px halo ring against their panel;
secondary and destructive actuators sit on Surface Level 2 with the specified borders and
hover states; metric wells moved from `surface-subtle` to `surface-well`.

**Fonts are the one place I did not follow the template.** DESIGN.md specifies Inter for
body text, and you asked for that to go — Inter is the default on every generated
dashboard and reads as such. Body is **IBM Plex Sans** (commissioned for IBM's own
hardware documentation), display is **Archivo** with Chivo as fallback, telemetry is
**JetBrains Mono**. Say the word and I will put Chivo/Inter back.

## 2. The trip sequence is now a report, not a set piece

**Removed:** CRT collapse to a scan line, chromatic aberration fringing, horizontal
tearing bars, full-screen branching lightning, floating embers, the aftershock shake, the
whole-console chassis shake, and the character-scramble verdict text.

**Kept:** the console dims, a fault rule draws across the head of the panel, and the
oscillographic event report settles in. The oscillogram still draws itself on, because
that is the measurement arriving and it is the only motion left that carries information.

It is now dismissable on click and holds for 4.2s. `ArcDischarge.jsx` was **deleted**.

The reasoning: the seriousness of a breaker operation is in the numbers. Staging effects
on top of a fault record undercuts the record.

## 3. New: rack status ribbon

`StatusStrip.jsx` runs across the top of the console — node, sensor, firmware, channel
state, rail voltage, line frequency, trip setting, last packet. Strictly rectilinear with
1px partitions, per the status-strip rule in the design system. Identity and link state
only; measurements stay on the instrument faces.

## 4. Behavioural changes you should know about

**Tripped now beats stale.** A breaker that opens and then loses power or WiFi latches
red indefinitely. `unreachable` is tracked separately so stale readings are never
presented as live — voltage and current blank to `—`, the oscillograph flattens, figures
are labelled *last recorded*, and controls withdraw.

**Peak trip load is frozen at inception.** An open relay reads ~0 W, so the load that
opened the breaker is gone by the time `tripped` arrives. The highest of the last three
energised readings is held until reset. Voltage and power factor are frozen too — an open
relay reports a meaningless PF near 0.5, and reconstructing a fault from that put the
pickup current out by a factor of two.

**Mock mode activates on the URL** as well as `VITE_MOCK=1`, so the sidebar's Mock links
switch scenarios with no rebuild. `cross-env` is in devDependencies, so the scripts run on
Windows.

## 5. Files added since the original build

```
components/  StatusStrip  FaultRecord  TripCurve  ACScope  PhasorDiagram
             PowerFlowRibbon  CommandPipeline  BootSequence  ElectricField
             ParticleBackground  HoverPanel  ScrambleText  LinkTrace  Icons
hooks/       useAnimatedNumber  useReducedMotion  usePrevious
             usePointerGlow  useTilt
mock/        mockTelemetry
```

## 6. Files removed

- `GridBackground.jsx` — superseded by `ElectricField`
- `ArcDischarge.jsx` — removed with the trip theatrics
- `HeartbeatLine.jsx` — renamed `LinkTrace.jsx`; the ECG became a 50 Hz mains carrier,
  since a medical waveform had no place on a power monitor

## 7. Still open

`ScrambleText.jsx` is now unused — it survives only because you may want it elsewhere.
Delete it if not.

The status strip repeats rail voltage and line frequency, which also appear in the
extended telemetry panel. That is deliberate (strip = at-a-glance, panel = full register
map) but it is the one duplication left in the layout, and worth a look on your screen.
