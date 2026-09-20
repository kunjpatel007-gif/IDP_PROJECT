import { motion } from 'framer-motion';
import LinkTrace from '@/components/LinkTrace';
import StatusOrb from '@/components/StatusOrb';
import { IconBell, IconChip, IconGrid, IconSliders, LogoMark } from '@/components/Icons';

/**
 * Instrumentation rail.
 *
 * Only Dashboard is a real destination — the other three are labelled slots on
 * the chassis, marked `aria-disabled` so a screen reader does not promise a
 * page that is not there.
 */

const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/', Icon: IconGrid, active: true },
  { id: 'devices', label: 'Mock: Trip', href: '/?mock=trip', Icon: IconChip },
  { id: 'alerts', label: 'Mock: Cycling', href: '/?mock=cycling', Icon: IconBell, badge: true },
  { id: 'settings', label: 'Mock: Offline', href: '/?mock=offline', Icon: IconSliders },
];

const LINK_LEDS = {
  live: { status: 'online', label: 'Connected', tone: 'text-accent-green' },
  connecting: { status: 'loading', label: 'Connecting…', tone: 'text-on-surface-muted' },
  empty: { status: 'caution', label: 'No telemetry', tone: 'text-primary-soft' },
  error: { status: 'tripped', label: 'Link error', tone: 'text-accent-red' },
};

export default function Sidebar({ connection = 'connecting', alertCount = 0, fwVersion, deviceId }) {
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
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-3 pt-5" aria-label="Sections">
            {NAV.map(({ id, label, href, Icon, active, badge }) => {
              const showBadge = badge && alertCount > 0;
              return (
                <a
                  key={id}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center justify-between overflow-hidden rounded px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-surface-card text-primary'
                      : 'text-on-surface-muted hover:bg-surface-card/60 hover:text-on-surface'
                  }`}
                >
                  {/* Hover glow blooming behind the icon */}
                  <span
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        'radial-gradient(circle at 16% 50%, rgba(217,119,54,0.2) 0%, transparent 62%)',
                    }}
                  />
                  {active ? (
                    <motion.span
                      layoutId="nav-marker"
                      className="absolute inset-y-1 left-0 w-[2px] bg-primary"
                    />
                  ) : null}
                  <span className="flex items-center gap-3.5">
                    <Icon width={18} height={18} />
                    {label}
                  </span>
                  {showBadge ? (
                    <span className="rounded bg-accent-red-bg px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-red">
                      {alertCount}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border-subtle px-5 py-4">
          <div className="flex items-center justify-between rounded border border-border-subtle bg-surface-subtle px-2.5 py-2 shadow-well">
            <LinkTrace alive={alive} colour={alive ? '#22c55e' : '#ef4444'} />
            <StatusOrb status={link.status} size={7} />
          </div>

        </div>
      </aside>

      {/* ── Handheld chassis bar ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-rail lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
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

      {/* Scenario rail — the same destinations as the desktop nav */}
      <nav
        className="hide-scrollbar flex gap-2 overflow-x-auto border-t border-border-subtle px-4 py-2"
        aria-label="Sections"
      >
        {NAV.map(({ id, label, href, active }) => (
          <a
            key={id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-10 shrink-0 items-center whitespace-nowrap rounded border px-3.5 text-[12px] font-medium transition-colors ${
              active
                ? 'border-primary/45 bg-surface-card text-primary'
                : 'border-border-subtle text-on-surface-muted'
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
      </header>
    </>
  );
}
