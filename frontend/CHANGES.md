# CHANGES

Applied to the uploaded `frontend.zip`. Read this before diffing — several files were
restored wholesale and two were deleted.

Run `node scripts/audit-telemetry.mjs` at any time to re-check the telemetry findings
below. It exits non-zero on a blocker, so it works as a pre-commit gate.

---

## 1. Blocking bug: the console was latched to rehearsal data

`MOCK` was a module-load constant reading `window.location.search`. In a single-page app
the query string never changes, so once you opened `?mock=trip` there was no way back to
the ESP32 without hand-editing the address bar. The sidebar scenario links made it easy
to fall in and impossible to climb out.

**Fixed.** The data source is now runtime state, not a constant.

- `subscribeTelemetry(onData, onError, source)` and `sendCommand(command, source)` take
  the source as an argument
- `useDevice(source)` re-subscribes when it changes, tearing down one stream and opening
  the other, and clears accumulated history so the two streams never blend
- New `SourceSwitch` sits above the tabs, permanently visible, labelled **SYNTHETIC
  DATA** or **ESP32 · LIVE**
- Selecting Adapter strips `?mock=` from the URL, so a reload does not drop back in

Verified end to end: loading `?mock=cycling`, clicking Adapter, and confirming the URL
returns to `/` with the Firestore subscription live.

## 2. `globals.css` had been gutted

The stylesheet was down to 66 lines from 831. Twenty-one animation classes referenced by
components no longer existed, including the whole odometer block — which is why the power
readout was rendering `01234567890123456789…` instead of clipping each drum to one digit.
Also missing: every annunciator LED state, the button spinner, relay contact and breaker
lever animations, metric flash, toast shake, console grid.

**Restored in full**, keeping the `animate-fade-in` the agent added for tab transitions.

## 3. Telemetry hardcoding: 25 findings, 8 blockers → 0 blockers

`scripts/audit-telemetry.mjs` is new and is what produced these.

**Blockers fixed** — device facts invented in the UI:

- `deviceName` defaulted to `'Living Room Socket'` and `deviceId` to `'socket1'`. A
  missing field now reads as unnamed/unreported rather than asserting a device that may
  not be the one connected.
- `FaultRecord` listed six sub-cycle event timestamps (`+0.105 s Trip asserted`) as if
  measured. The adapter publishes RMS registers on a 5s cadence and keeps no event log,
  so none of those times existed. They are now **derived from the model's own cycle
  boundaries** at the live line frequency, and the panel says *times derived*.

**Warnings fixed** — physical constants standing in for missing readings. All moved to
`src/lib/nominal.js`, declared and commented, and used only to size an axis or seed a
reconstruction:

- `threshold` no longer silently defaults to 1500 W. `thresholdKnown` is exposed, and the
  Protection tab shows *not published* when the device has not sent one.
- The current sparkline scaled against a hardcoded 230 V; it now uses measured voltage.
- Scope full-scale constants and the reconstruction pre-load ratio are named rather than
  bare literals.

Two warnings remain by design: `NOMINAL_VOLTAGE` seeds the fault reconstruction when the
device never reported a voltage. Both are in `nominal.js` and documented.

## 4. Colour scheme is now exactly the reference

The palette had drifted back to the pre-template values. Re-pointed every token and every
hardcoded hex in the canvas and SVG components: surfaces `#121316` / `#1a1b1f` / `#22242a`
/ `#2a2d35`, borders `#2e313a` and `#383c47`, text `#f4f4f6` / `#9da2af` / `#686d7c`,
critical `#ef4444`. Added the two states that were missing entirely — Status Caution
(`#f59e0b`) and Status Offline (`#4b5262`). Instrument Amber and Status Nominal were
already right.

## 5. Animations taken to a professional register

**Deleted:** `ArcDischarge.jsx` (full-screen branching lightning), `ScrambleText.jsx`
(character-scramble headings).

**TripOverlay rewritten.** Gone: CRT collapse, chromatic aberration, screen tearing,
embers, aftershock, chassis shake. What remains: the console dims, a fault rule draws
across the panel head, and the oscillographic event report settles in. The oscillogram
still draws on, because that is the measurement arriving and it is the only motion left
that carries information. Dismissable on click.

Tab headings are now plain type instead of resolving out of noise.

## 6. Tabs kept, and given something real to show

All four tabs are preserved. Three of them were placeholders reading *Requires backend
time-series accumulator* over hardcoded zeros.

New `useSessionStats` accumulates from the live stream: energy integrated from power over
actually-observed intervals, peak with its timestamp, running mean, rail excursion, and
trips witnessed. Every figure is scoped to the session and labelled as such — a real
measurement of a short window rather than a fake measurement of a long one. It resets on
a source switch, since the two streams are not one history.

- **Historical** — session energy, peak observed, mean power, rail min/max
- **Protection** — breaker state, trips this session, present load against threshold,
  latched peak trip load, and the read-only trip setting with an honest note on why
- **Network** — identity, firmware, radio, heap, all from the device with *unreported*
  where the firmware sends nothing

## 7. Still open

The Historical tab cannot show anything before the page was opened. Real history needs
the ESP32 or the Cloud Function to append to a Firestore array — worth doing if you want
day-over-day figures for the showcase, but it is firmware and backend work, not frontend.
