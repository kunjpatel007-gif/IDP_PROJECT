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
npm run dev:mock
```

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
    LinkTrace.jsx           50 Hz mains carrier for the cloud link
    ControlButton.jsx       relay/breaker actuator
    ToastNotification.jsx   toast context, provider, viewport
    DetailsPanel.jsx        extended telemetry register map
    LiveDataBadge.jsx       packet counter
    GridBackground.jsx      graph-paper backdrop
    Icons.jsx               hand-drawn SVG icon set
  mock/mockTelemetry.js     rehearsal mode only
  styles/globals.css        Tailwind layers plus the instrument keyframes
```

No charting library. Every trace, gauge and meter is hand-rolled SVG or canvas.

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

## Scope

Dashboard only. The Devices, Alerts and Settings nav entries are labelled chassis slots,
marked `aria-disabled` so a screen reader does not promise a page that is not there.
No auth, no backend, no threshold editor.
