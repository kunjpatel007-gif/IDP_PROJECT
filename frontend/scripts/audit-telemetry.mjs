/**
 * Telemetry hardcoding audit.
 *
 * Flags places where a value that should come from the device is instead
 * baked into the source. Three severities:
 *
 *   blocker  a device fact invented in the UI (names, ids, event times)
 *   warn     a physical constant used as a silent fallback for missing data
 *   scale    a display-scaling constant — legitimate, but must be declared
 *
 * Run: node scripts/audit-telemetry.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  { re: /['"]Living Room Socket['"]/, sev: 'blocker', why: 'device name invented in the UI; must come from device_name' },
  { re: /\?\?\s*['"]socket1['"]/, sev: 'blocker', why: 'device id defaulted; a missing id should read as unknown' },
  { re: /\+0\.\d{3}\s*s/, sev: 'blocker', why: 'fabricated event timestamp presented as a measurement' },
  { re: /\?\?\s*1500|=\s*1500\b/, sev: 'warn', why: 'trip threshold defaulted; device publishes threshold' },
  { re: /\?\?\s*230\b|\|\|\s*230\b|=\s*230\b/, sev: 'warn', why: 'nominal mains voltage used as a fallback for live voltage' },
  { re: /\?\?\s*0\.95|=\s*0\.95\b/, sev: 'warn', why: 'power factor assumed; device publishes power_factor' },
  { re: /\/\s*230\b/, sev: 'warn', why: 'current derived against assumed voltage instead of measured' },
  { re: /\/\s*260\b|Math\.max\(10,/, sev: 'scale', why: 'scope full-scale constant; declare it centrally' },
  { re: /threshold\s*\*\s*0\.\d+/, sev: 'scale', why: 'magic ratio used to synthesise pre-fault load' },
];

const SKIP = /node_modules|dist|\/mock\/|audit-telemetry/;
const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(p)) scan(p);
  }
}

function scan(path) {
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\*|\/\/)/.test(line)) return; // comments describe, they don't run
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({ path: path.replace(/^\.\//, ''), line: i + 1, ...rule, src: line.trim().slice(0, 96) });
      }
    }
  });
}

walk('./src');

const order = { blocker: 0, warn: 1, scale: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.path.localeCompare(b.path));

const counts = findings.reduce((acc, f) => ({ ...acc, [f.sev]: (acc[f.sev] || 0) + 1 }), {});
console.log(`\nTELEMETRY AUDIT — ${findings.length} findings`);
console.log(`blocker ${counts.blocker || 0} · warn ${counts.warn || 0} · scale ${counts.scale || 0}\n`);

let current = null;
for (const f of findings) {
  if (f.sev !== current) {
    current = f.sev;
    console.log(`── ${f.sev.toUpperCase()} ${'─'.repeat(52 - f.sev.length)}`);
  }
  console.log(`  ${f.path}:${f.line}`);
  console.log(`    ${f.why}`);
  console.log(`    > ${f.src}`);
}
console.log('');
process.exit(counts.blocker ? 1 : 0);
