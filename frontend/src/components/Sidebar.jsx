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
  live: { status: 'online', label: 'Connected', tone: 'text-accent-green' },
  connecting: { status: 'loading', label: 'Connecting…', tone: 'text-on-surface-muted' },
  empty: { status: 'caution', label: 'No telemetry', tone: 'text-primary-soft' },
  error: { status: 'tripped', label: 'Link error', tone: 'text-accent-red' },
};

export default function Sidebar({ connection = 'connecting', alertCount = 0, fwVersion, deviceId, activeTab = 'overview', onTabChange }) {
  const link = LINK_LEDS[connection] ?? LINK_LEDS.connecting;
  const alive = connection === 'live';

  return (
    <>
      {/* ── Desktop rail ─────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 select-none flex-col justify-between border-r border-border-subtle bg-surface-rail lg:flex">
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

          <nav className="mt-6 flex flex-col gap-1 px-3" aria-label="Main">
            {NAV.map(({ id, label, Icon, badge }) => {
              const active = id === activeTab;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex h-10 w-full items-center gap-3 rounded px-3 text-[13px] font-medium transition-colors ${
                    active ? 'text-primary' : 'text-on-surface-muted hover:text-on-surface'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  {active && (
                    <div className="absolute inset-0 rounded bg-primary/10 opacity-100 transition-opacity" />
                  )}
                  <Icon
                    width={18}
                    height={18}
                    className={active ? 'text-primary' : 'text-on-surface-subtle group-hover:text-on-surface-muted'}
                  />
                  <span className="relative z-10 text-left">{label}</span>

                  {badge && alertCount > 0 ? (
                    <span className="relative z-10 ml-auto flex h-5 w-5 items-center justify-center rounded bg-accent-red-bg font-mono text-[10px] font-medium text-accent-red">
                      {alertCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-5 pb-5">
          <div className="mb-4">
            <p className="px-1 text-[10px] font-bold tracking-wider text-on-surface-subtle uppercase mb-2">Dev Scenarios</p>
            <div className="flex flex-col gap-1">
              {MOCK_LINKS.map(m => (
                <a key={m.id} href={m.href} className="text-[11px] text-on-surface-muted hover:text-primary transition-colors px-1 py-0.5">
                  ▶ Mock: {m.label}
                </a>
              ))}
            </div>
          </div>
          
          <div className="rounded border border-border-muted bg-surface px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-on-surface-subtle uppercase tracking-wider">Cloud Link</span>
              <StatusOrb status={link.status} size={6} />
            </div>
            <div className="mt-2.5 flex items-end justify-between">
              <p className={`font-mono text-[12px] font-medium ${link.tone}`}>
                {link.label}
              </p>
              <LinkTrace alive={alive} colour={alive ? '#22c55e' : '#ef4444'} width={50} />
            </div>
            {deviceId && (
              <p className="mt-2.5 font-mono text-[10px] text-on-surface-subtle">
                ID: {deviceId}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ── Mobile chassis bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface lg:hidden">
      <div className="flex h-14 items-center justify-between px-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display text-[14px] font-semibold tracking-tight text-on-surface">
            SmartAdapter
          </span>
        </div>
        <div className="flex items-center gap-3">
          {alertCount > 0 ? (
            <span className="rounded bg-accent-red-bg px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-red">
              {alertCount} alert
            </span>
          ) : null}
          <LinkTrace alive={alive} colour={alive ? '#22c55e' : '#ef4444'} width={44} />
          <StatusOrb status={link.status} size={7} />
        </div>
      </div>

      <nav
        className="hide-scrollbar flex gap-2 overflow-x-auto border-b border-border-subtle px-4 py-2"
        aria-label="Sections"
      >
        {NAV.map(({ id, label }) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-10 shrink-0 items-center whitespace-nowrap rounded border px-3.5 text-[12px] font-medium transition-colors ${
                active
                  ? 'border-primary/45 bg-surface-card text-primary'
                  : 'border-border-subtle text-on-surface-muted'
              }`}
            >
              {label}
            </button>
          );
        })}

        <div className="mx-2 w-[1px] shrink-0 bg-border-muted" />
        
        {MOCK_LINKS.map(m => (
          <a
            key={m.id}
            href={m.href}
            className="flex h-10 shrink-0 items-center whitespace-nowrap rounded border border-border-subtle border-dashed px-3.5 text-[11px] font-medium text-on-surface-subtle transition-colors hover:border-primary/45 hover:text-primary"
          >
            Mock: {m.label}
          </a>
        ))}
      </nav>
      </header>
    </>
  );
}
