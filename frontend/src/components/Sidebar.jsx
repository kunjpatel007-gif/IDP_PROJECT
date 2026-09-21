import { motion } from 'framer-motion';
import LinkTrace from '@/components/LinkTrace';
import StatusOrb from '@/components/StatusOrb';
import { IconBell, IconChip, IconGrid, IconSliders, LogoMark } from '@/components/Icons';

const NAV = [
  { id: 'overview', label: 'Live Overview', Icon: IconGrid },
  { id: 'historical', label: 'Historical & Analytics', Icon: IconChip },
  { id: 'protection', label: 'Protection & Alerts', Icon: IconBell, badge: true },
  { id: 'network', label: 'Network & Device', Icon: IconSliders },
];

const MOCK_LINKS = [
  { id: 'trip', label: 'Trip', href: '/?mock=trip' },
  { id: 'cycling', label: 'Cycling', href: '/?mock=cycling' },
  { id: 'offline', label: 'Offline', href: '/?mock=offline' },
];

const LINK_LEDS = {
  live: { status: 'online', label: 'Connected', tone: 'text-accent-green', wire: '#22c55e' },
  connecting: { status: 'loading', label: 'Connecting\u2026', tone: 'text-on-surface-muted', wire: '#686d7c' },
  empty: { status: 'caution', label: 'No telemetry', tone: 'text-primary-soft', wire: '#d97736' },
  error: { status: 'tripped', label: 'Link error', tone: 'text-accent-red', wire: '#ef4444' },
};

function NavButton({ id, label, Icon, badge, active, alertCount, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-10 w-full items-center gap-3 overflow-hidden rounded px-3 text-left text-[13px] font-medium transition-colors cursor-target ${
        active ? 'text-primary' : 'text-on-surface-muted hover:bg-surface-subtle/50 hover:text-on-surface'
      }`}
    >
      {/* One shared layout element slides between items instead of four
          independent blocks cutting in and out. */}
      {active ? (
        <motion.span
          layoutId="nav-channel"
          className="nav-item-glow absolute inset-0 rounded"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          aria-hidden="true"
        />
      ) : null}
      {active ? (
        <motion.span
          layoutId="nav-rail"
          className="absolute left-0 top-2 h-6 w-[3px] rounded-r-full bg-primary"
          style={{ boxShadow: '0 0 10px 0 rgba(217,119,54,0.65)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          aria-hidden="true"
        />
      ) : null}

      <Icon
        width={18}
        height={18}
        className={`relative shrink-0 transition-all duration-200 ${
          active
            ? 'text-primary'
            : 'text-on-surface-muted group-hover:translate-x-[1px] group-hover:text-on-surface'
        }`}
      />
      <span className="relative truncate">{label}</span>

      {badge && alertCount > 0 ? (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 18 }}
          className="relative ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 font-mono text-[9px] font-bold text-white"
          style={{ boxShadow: '0 0 12px 0 rgba(239,68,68,0.6)' }}
        >
          {alertCount}
        </motion.span>
      ) : null}
    </button>
  );
}

export default function Sidebar({
  connection = 'connecting',
  alertCount = 0,
  fwVersion,
  deviceId,
  activeTab = 'overview',
  onTabChange,
}) {
  const link = LINK_LEDS[connection] ?? LINK_LEDS.connecting;
  const alive = connection === 'live';

  return (
    <>
      {/* \u2500\u2500 Desktop rail \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 select-none flex-col justify-between border-r border-border-subtle bg-surface-rail shadow-chassis lg:flex">
        {/* The rail is a separate piece of metal from the console face, so it
            catches its own light down the inside edge. */}
        <span
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{
            background:
              'linear-gradient(180deg, rgba(217,119,54,0.28) 0%, rgba(56,60,71,0.5) 22%, rgba(56,60,71,0.2) 100%)',
          }}
          aria-hidden="true"
        />

        <div className="flex flex-col">
          <div className="flex h-16 items-center gap-2.5 border-b border-border-subtle px-5">
            <LogoMark />
            <div className="leading-none">
              <p className="font-display text-[15px] font-semibold tracking-tight text-on-surface">
                SmartAdapter
              </p>
              <p className="mt-[3px] font-mono text-[9px] text-on-surface-subtle">
                {fwVersion ? `FW ${fwVersion}` : 'SCANNING...'}
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-3 pt-3" aria-label="Main">
            {NAV.map((item) => (
              <NavButton
                key={item.id}
                {...item}
                active={item.id === activeTab}
                alertCount={alertCount}
                onSelect={onTabChange}
              />
            ))}
          </nav>
        </div>

        <div className="mt-auto px-5 pb-5">
          <div className="mb-4">
            <p className="panel-label mb-2 px-1 text-on-surface-subtle">Scenario override</p>
            <div className="flex flex-wrap gap-1.5">
              {MOCK_LINKS.map((m) => (
                <a
                  key={m.id}
                  href={m.href}
                  className="rounded border border-border-subtle bg-surface-subtle px-2 py-1 font-mono text-[9px] tracking-[0.04em] text-on-surface-muted transition-colors hover:border-border-muted hover:bg-surface-card-hover hover:text-on-surface cursor-target"
                >
                  {m.label}
                </a>
              ))}
            </div>
          </div>

          {/* Was rendered with no props, so the carrier was permanently flat \u2014
              a dead trace sitting next to a green LED reading "Connected". */}
          <LinkTrace alive={alive} colour={link.wire} width={68} />

          <div className="mt-4 flex items-center gap-2 rounded border border-border-subtle bg-surface-subtle px-3 py-2.5">
            <StatusOrb status={link.status} />
            <div className="flex min-w-0 flex-col leading-none">
              <span className={`font-mono text-[9px] font-bold uppercase tracking-wider ${link.tone}`}>
                {link.label}
              </span>
              <span className="mt-[3px] truncate font-mono text-[9px] text-on-surface-muted">
                {alive ? (deviceId ?? 'Unknown MAC') : 'Link down'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* \u2500\u2500 Mobile topbar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <header className="sticky top-0 z-40 flex flex-col border-b border-border-subtle bg-surface-rail/95 shadow-chassis backdrop-blur-sm lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-[15px] font-semibold tracking-tight text-on-surface">
              SmartAdapter
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {alertCount > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 font-mono text-[9px] font-bold text-white">
                {alertCount}
              </span>
            ) : null}
            <StatusOrb status={link.status} />
          </div>
        </div>
        <nav
          className="hide-scrollbar flex gap-2 overflow-x-auto border-t border-border-subtle px-4 py-2"
          aria-label="Sections"
        >
          {NAV.map(({ id, label }) => {
            const active = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium transition-colors cursor-target ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-muted bg-surface-subtle text-on-surface-muted hover:border-on-surface-muted hover:text-on-surface'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>
    </>
  );
}
