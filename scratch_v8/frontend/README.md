# SmartAdapter — Telemetry Console

Real-time dashboard for a physical SmartAdapter: an ESP32 with a PZEM-004T AC power
sensor on a mains socket, plus a relay acting as a software circuit breaker.

React + Vite. Dark-only industrial instrument aesthetic, amber accent, no neon.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 — live Firestore data
```

```bash
npm run build        # production bundle into dist/
npm run preview      # serve the production build
```

Firebase is already configured in `src/firebase.js` — no `.env`, nothing to fill in.
The config there is the live `smart-adapter-backend` project.

### Rehearsal mode

```bash
npm run dev:mock      # cross-env, so it runs on Windows too
```

Or just append `?mock=<scenario>` to any URL — `MOCK` activates on the query string as
well as the env var, so the sidebar's Mock links switch scenarios with no rebuild.

Feeds the console a synthetic adapter instead of Firestore, so you can walk the trip
sequence without tripping a real breaker — and so a demo still runs if the bench
hardware sulks. Append a scenario to the URL:

| URL | What it does |
|---|---|
| `?mock=steady` | A settled ~250 W load with mild drift (default) |
| `?mock=trip` | Ramps past the 1,500 W threshold and trips at ~10s |
| `?mock=offline` | Stops transmitting after 4s, so the card goes stale |
| `?mock=faultdrop` | Trips at ~10s, then loses the link — the latched fault case |
| `?mock=cycling` | A compressor duty-cycling on and off |

Commands loop back through the simulated device, so **Reset Breaker** works in mock too.
The mock is dynamically imported and gated on `VITE_MOCK=1`, so it is never in a normal
production bundle.

---

## How the data flows

```
ESP32 ──POST /ingest──▶ Cloud Function ──write──▶ telemetry/socket1
                                                        │
                                                   onSnapshot
                                                        ▼
                                                  this dashboard
                                                        │
                                                     setDoc
                                                        ▼
ESP32 ◀──poll every 2s── Cloud Function ◀──read── commands/socket1
```

### The control path is one document write

The dashboard never talks to the hardware directly. Pressing a control button writes a
single document:

```js
setDoc(doc(db, 'commands', 'socket1'), { command: 'OFF', issued_at: serverTimestamp() })
```

The ESP32 polls the Cloud Function every 2s; the function reads and atomically deletes
the pending command and hands it to the device. **This is why the buttons work from any
network on earth** — there is no LAN requirement and no `smartsocket1.local` anywhere in
this codebase.

Worst case round trip is about 7s: 2s command poll plus 5s telemetry push. The button
acknowledges the write immediately with a toast; the `relay_on` field in a later snapshot
is the real confirmation, and the relay rocker in the card footer is what actually moves.

Requires the deployed rule allowing `write: if true` on `commands/{deviceId}`.

---

## Device status

Derived, never stored, and re-derived every second by a ticker so a device that dies
silently changes state on its own without Firestore sending anything:

```
tripped       →  Tripped      (checked first — the fault latches)
silent > 15s  →  Offline
otherwise     →  Online
```

**Tripped beats stale, deliberately.** A breaker that opens and then loses power or WiFi
died in a fault state, and that is exactly what an operator must still be able to see.
The card stays red indefinitely and only clears when the device returns and reports
itself clear.

Latched red is not the same as live, so the two facts are tracked separately.
`unreachable` is the independent fact that nothing is arriving, and it governs everything
that would otherwise present stale data as current:

- Voltage and current blank to `—` rather than showing a frozen last reading
- The utilisation oscillograph flattens — no live signal, no live trace
- The latched figures are labelled **last recorded**
- A **link lost** chip sits beside the Tripped badge
- Controls are withdrawn for *"no link — reset when it returns"*, because a command
  written to a device that is not polling cannot land, and the queue entry expires on
  its 30s TTL

The relay still reads **OPEN**, because a tripped breaker is definitively open regardless
of whether the adapter is talking.

### Peak trip load

A tripped relay reads ~0 W, so by the time `tripped: true` arrives the load that actually
opened the breaker is already gone. `useDevice` freezes the highest of the last three
energised readings and holds it until reset, which is what the card headline, the
utilisation trace and the trip overlay all report. Without this the card reads
"Peak trip load: 0 W" at exactly the moment the judges are looking at it.

---

## Structure

```
src/
  main.jsx                  entry, wraps App in the toast provider
  App.jsx                   layout, command dispatch, trip choreography
  firebase.js               init, subscribeTelemetry, sendCommand, timestamp parsing
  lib/format.js             number/unit formatting
  hooks/
    useDevice.js            subscription, derived status, stale ticker, peak capture
    useSparkline.js         rolling 20-sample ref buffer, de-duplicated on `seq`
    useAnimatedNumber.js    damped-spring numeric integrator
    useReducedMotion.js     prefers-reduced-motion tracking
    usePrevious.js          edge detection
  components/
    Sidebar.jsx             rail on desktop, chassis bar on handheld
    StatsRow.jsx            four metric wells with spring counters
    DeviceCard.jsx          boot sequence, readout, wells, oscillograph, actuators
    PowerMeter.jsx          odometer readout
    WaveformBar.jsx         canvas oscillograph utilisation bar
    StatusOrb.jsx           volumetric annunciator LED
    SparklineChart.jsx      hand-rolled SVG rolling trace
    PowerFactorGauge.jsx    moving-needle meter
    TripOverlay.jsx         full-screen trip event
    BootSequence.jsx        one-time power-on self test
    ACScope.jsx             dual-trace mains oscilloscope, real phase lag
    PhasorDiagram.jsx       rotating V/I phasors and the power triangle
    PowerFlowRibbon.jsx     charge carriers flowing grid → relay → load
    CommandPipeline.jsx     live command round-trip staging
    LinkTrace.jsx           50 Hz mains carrier for the cloud link
    ControlButton.jsx       relay/breaker actuator
    ToastNotification.jsx   toast context, provider, viewport
    DetailsPanel.jsx        extended telemetry register map
    LiveDataBadge.jsx       packet counter
    ElectricField.jsx       live charge-field backdrop, tracers on field lines
    ArcDischarge.jsx        procedural branching lightning
    FaultRecord.jsx         oscillographic event report + sequential events recorder
    TripCurve.jsx           IEC inverse time-current characteristic, live operating point
    ScrambleText.jsx        signal-acquisition text resolve
    ParticleBackground.jsx  drifting dust motes, scatter impulse on trip
    HoverPanel.jsx          cursor-reactive panel: tilt, tracked light, warm border
  hooks/
    usePointerGlow.js       pointer position written as CSS vars, no re-render
    useTilt.js              spring-damped panel lean toward the cursor
    Icons.jsx               hand-drawn SVG icon set
  mock/mockTelemetry.js     rehearsal mode only
  styles/globals.css        Tailwind layers plus the instrument keyframes
```

No charting library. Every trace, gauge and meter is hand-rolled SVG or canvas.

## Cursor interaction

Hover does real work here, not just decoration. Four of these are measurements.

| Surface | On hover |
|---|---|
| Mains waveform | A **measurement cursor**: dashed vertical line, markers where it crosses each trace, and a live readout of elapsed time, instantaneous voltage and instantaneous current at that point on the wave |
| Trip curve | A **coordination probe** — read the operate time at any current multiple, or "no operate" below pickup |
| Phasors | Rotation **holds** so the angle can actually be read, with a HOLD flag in the header |
| Stat wells, instrument panels, metric wells | Lean a few degrees toward the cursor, a soft light tracks across the face, the hairline border warms where the light falls |
| Current sparkline | Crosshair and value tooltip at the nearest sample |
| Relay actuators | Drift a couple of pixels toward an approaching cursor |

Three decisions behind that:

**Pointer position never goes through React state.** `usePointerGlow` writes `--px` and
`--py` straight onto the node. A spotlight that re-rendered a subtree on every
pointermove would cost more than the field solver and the scope put together; this way
the browser recomputes one gradient on the compositor.

**The scope cursor is drawn inside the canvas loop**, not as a DOM overlay. If the
readout were computed on pointermove it would freeze the instant the mouse stopped, while
the beam kept sweeping underneath it — a stale number sitting on a live trace. Drawing it
in the loop keeps it honest.

**Every handler bails on `pointerType === 'touch'`.** A finger has no hover state, and
without the guard the tilt would fire on every tap and the panel would lurch under the
thumb that pressed it. Reduced motion flattens the tilt to zero but keeps the light and
all the measurement cursors, since those carry information rather than movement.

### Motion details worth knowing before you change them

`PhasorDiagram` draws four ghost arrows spaced behind the present angle, so the direction
of rotation is readable from a still frame, with instantaneous V and I riding along at
each tip.

`SparklineChart` takes an optional `scaleMax`; when given, the trace colour tracks the
reading against its own headroom — green under half, amber to 80%, red above. The current
well passes `threshold / 230`, so the trace reddens as the socket approaches its limit.
A pointer tooltip is enabled per-instance and is pointer-only, so touch is unaffected.

`WaveformBar` shatters on the trip edge: the last drawn polyline is sliced into 22
fragments, each given an impulse and a spin, then integrated under gravity as it fades.
The trip overlay sits on top for 2.7s, so the fragments are tuned to stay in the air long
enough that the tail is still falling when the shutter wipes back.

`DetailsPanel` carries 10-sample inline trends on radio and heap. Voltage and current are
deliberately not duplicated there — they already have full-width traces on the card face,
and the panel is for registers that are not.

### The trip is a relay event, not an alert box

`TripOverlay` runs four phases: the console folds to a scan line as the supply sags
(200ms), dielectric breakdown arcs across the field (500ms), the oscillographic event
report resolves in, then a shutter wipes back. No emoji and no exclamation mark — a
protection device that has just interrupted a fault reports what it measured.

`FaultRecord` draws the current through the event with a **decaying DC offset**, because
closing into a fault at an arbitrary point on the wave produces asymmetrical current:

```
i(t) = √2·If·[ sin(ωt − φ) + sin(φ)·e^(−t/τ) ]
```

which is why the first loop after inception is visibly taller and the trace rides above
the axis before settling. Alongside it: pre-trigger window, inception and interruption
cursors, pickup thresholds, a sequential events recorder, and computed peak let-through
and I²t.

Stated on the panel, because it matters: the PZEM exposes RMS registers, not a sampled
waveform, so the trace is **reconstructed from the recorded peak** — it is not a captured
COMTRADE record. The magnitudes are real; the sample-level shape is modelled.

The reconstruction uses the voltage and power factor frozen at fault inception, not the
live ones. An open relay reports a meaningless power factor of about 0.5 with no load
attached, and reconstructing from that puts the pickup current out by a factor of two.

`TripCurve` plots the IEC 60255 standard-inverse characteristic on log-log axes:

```
t(M) = k·TMS / (M^α − 1)     k = 0.14,  α = 0.02,  M = I / Is
```

with the socket's present operating point on it. Below pickup the marker sits in the
no-operate region; past it the marker slides onto the curve and reports how long the
breaker would tolerate that current. A load ramping up walks the dot along the curve.

### The backdrop is a field solver

`ElectricField` places four point charges around the viewport and oscillates their
magnitudes out of phase. The field at any point is the superposition

```
E(p) = Σ qᵢ · (p − rᵢ) / |p − rᵢ|³
```

and several hundred massless tracers are integrated along E each frame. They are not
following scripted paths — they are drawing the field lines of an actual charge
configuration, so when the charges reverse the whole field turns inside out on its own.
Trails come from compositing: the canvas is never cleared, only veiled with a translucent
wash, so each tracer smears into a streak. Intensity is driven by socket utilisation —
cold sparse drift at idle, fast amber streaming under load, incoherent crimson past the
trip threshold.

`ArcDischarge` builds each bolt by recursive midpoint displacement: displace a segment's
midpoint perpendicular to itself, recurse into both halves with the offset halved, seven
levels deep, with a branching chance at each level. Every bolt is rebuilt from scratch
every 90ms, so no two discharges are the same shape. Three strokes per bolt — wide dim
corona, mid glow, near-white core — replace a blur filter at a fraction of the cost.

### The instrument bay is real physics, not decoration

`ACScope` and `PhasorDiagram` are reconstructed from the PZEM registers using the
standard single-phase relations, so an examiner can check them:

```
φ = arccos(PF)          v(t) = V√2·sin(ωt)      i(t) = I√2·sin(ωt − φ)
S = V·I                 P = S·cos φ             Q = S·sin φ        S = √(P² + Q²)
```

The current trace lags the voltage trace by the true power factor angle. Plug in a
motor and the traces visibly separate and the power triangle grows a vertical leg; plug
in a heater and they lock in phase and Q collapses. `P` computed this way agrees with the
`power` field the PZEM reports independently — the triangle closes against the hardware.

`CommandPipeline` stages the four hops a relay command actually takes, with their real
budgets. The final hop does not run on a timer: it closes only when a snapshot arrives
reporting the commanded relay state, so the tick is genuine hardware confirmation rather
than an animation that always succeeds. If nothing returns inside the window, it says so.

---

## Notes on the motion

A few things are not what they look like, and are worth knowing before you change them.

**The odometer** runs a strip of 0–9 repeated three times. A digit is parked in the middle
copy, which leaves a full revolution of headroom either way, so 9 → 0 on a *rising* value
rolls forward through the wrap instead of spinning backwards through 8, 7, 6. When the
transition lands the strip snaps back to the middle copy with the transition switched off;
the strip is periodic so the snap is invisible. Digits stagger from the right.

**The utilisation bar** is canvas, not SVG — one draw call per frame instead of a DOM
mutation. Amplitude, frequency and hue all scale off load, a second harmonic is mixed in
because a pure sine reads synthetic, and past 100% the trace tears into broadband noise.

**Sparkline buffers** are keyed on the telemetry `seq` field. The 1s stale ticker re-renders
the tree every second, and without that key it would inject phantom points between real
packets.

**Reduced motion** is honoured throughout, but critical state keeps a slow blink — a tripped
breaker must still read as tripped when the animation is switched off.

---

## Performance

Canvas work is `requestAnimationFrame` throughout, never `setInterval`. Every canvas
handles `devicePixelRatio`. `ElectricField` and `ParticleBackground` park their loops on
`visibilitychange` so a backgrounded tab solves nothing, and particle budgets scale down
on narrow viewports and when `navigator.hardwareConcurrency < 4`. The constellation mesh
samples every third tracer rather than doing an O(n²) pass, which would cost more than
the field solve itself.

## Responsive behaviour

Verified with no horizontal overflow and no JS errors at 360, 390, 768 and 820px.

| Width | Layout |
|---|---|
| ≥1280px | Sidebar rail, adapter bay beside the empty slot, scope and phasors side by side |
| 1024–1279px | Sidebar rail, single-column bay |
| 640–1023px | Sidebar collapses to a chassis top bar; stats stay 2×2 |
| <640px | Single-column stack, compact metric type, text addresses drop from stat headers |

Touch targets go compact only at `lg` (1024px), not `sm` — a 820px tablet is still a
finger, so the 40px minimum holds all the way up to where the desktop sidebar appears.
The packet badge is hidden below `sm`, the viewport is `viewport-fit=cover`, and `body`
carries `env(safe-area-inset-*)` padding so nothing sits under a notch or home indicator.

## Scope

Dashboard only. The Devices, Alerts and Settings nav entries are labelled chassis slots,
marked `aria-disabled` so a screen reader does not promise a page that is not there.
No auth, no backend, no threshold editor.
