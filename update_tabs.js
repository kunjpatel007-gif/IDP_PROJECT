const fs = require('fs');
let content = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// 1. Remove electric fields and particles
content = content.replace(/<ParticleBackground[\s\S]*?\/>/g, '');
content = content.replace(/<ElectricField[\s\S]*?\/>/g, '');
content = content.replace(/import ParticleBackground.*/g, '');
content = content.replace(/import ElectricField.*/g, '');

// 2. Add Tab State
content = content.replace(
  'const alertCount = device.tripped ? 1 : 0;',
  "const alertCount = device.tripped ? 1 : 0;\n  const [activeTab, setActiveTab] = useState('overview');"
);

// 3. Update Sidebar Props
content = content.replace(
  /<Sidebar[\s\S]*?\/>/,
  `<Sidebar
        connection={device.connection}
        alertCount={alertCount}
        fwVersion={device.fwVersion}
        deviceId={device.deviceId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />`
);

// 4. Inject Tab Content
const mainStart = content.indexOf('<main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">');
const mainEnd = content.indexOf('</main>', mainStart) + '</main>'.length;
const originalMainContent = content.substring(mainStart + '<main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">'.length, content.indexOf('</main>', mainStart));

const newMainContent = `
          {/* ── Tabs ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in">
              ${originalMainContent.trim()}
            </div>
          )}

          {activeTab === 'historical' && (
            <div className="animate-fade-in">
              <header className="mb-7">
                <ScrambleText as="h1" text="HISTORICAL & ANALYTICS" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Daily Energy Consumption</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.00 <span className="text-sm text-on-surface-muted">kWh</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend time-series accumulator</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Peak Power Recorded</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.0 <span className="text-sm text-on-surface-muted">W</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend historical peak tracking</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Average Power</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.0 <span className="text-sm text-on-surface-muted">W</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend rolling aggregation</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Usage Patterns</h3>
                  <p className="text-sm text-on-surface-muted">Historical patterns not available. Require time-series database integration.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'protection' && (
            <div className="animate-fade-in">
              <header className="mb-7">
                <ScrambleText as="h1" text="PROTECTION & ALERTS" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Hardware Threshold</h3>
                  <div className="flex items-center gap-4">
                    <input type="number" disabled value={device.threshold || 0} className="bg-surface-subtle border border-border-muted rounded px-4 py-2 font-mono text-on-surface flex-1" />
                    <button disabled className="bg-border-muted text-on-surface-muted px-4 py-2 rounded font-medium text-sm">Edit (Requires FW Update)</button>
                  </div>
                  <p className="text-xs text-on-surface-muted mt-3">Currently read-only. A SET_THRESHOLD command must be added to the ESP32 code to enable edits.</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Overload Trips</h3>
                  <p className="text-3xl font-mono text-accent-red tracking-tight">0 <span className="text-sm text-on-surface-muted">events</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Persistent trip logging requires Firestore history array.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="animate-fade-in">
              <header className="mb-7">
                <ScrambleText as="h1" text="NETWORK & DEVICE" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Device Identity</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">Name:</span> <span className="text-on-surface">Living Room Socket</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">ID:</span> <span className="text-on-surface">{device.deviceId || 'socket1'}</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">Status:</span> <span className={device.connection === 'live' ? 'text-accent-green' : 'text-accent-red'}>{device.connection === 'live' ? 'ONLINE' : 'OFFLINE'}</span></div>
                    <div className="flex justify-between pb-2"><span className="text-on-surface-muted">IP Address:</span> <span className="text-on-surface">N/A (Update FW)</span></div>
                  </div>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Diagnostics</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">FW Version:</span> <span className="text-on-surface">{device.fwVersion || 'Unknown'}</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">RSSI:</span> <span className="text-on-surface">{device.rssi || 0} dBm</span></div>
                    <div className="flex justify-between pb-2"><span className="text-on-surface-muted">Free Heap:</span> <span className="text-on-surface">{device.freeHeap || 0} bytes</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
`;

const newMain = '<main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">\n' + newMainContent + '\n</main>';

const finalContent = content.substring(0, mainStart) + newMain + content.substring(mainEnd);
fs.writeFileSync('frontend/src/App.jsx', finalContent);
