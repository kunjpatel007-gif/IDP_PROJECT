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
  { id: 'dashboard', label: 'Dashboard', Icon: IconGrid, active: true },
  { id: 'devices', label: 'Devices', Icon: IconChip },
  { id: 'alerts', label: 'Alerts', Icon: IconBell, badge: true },
  { id: 'settings', label: 'Settings', Icon: IconSliders },
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
              <p className="mt-1 font-mono text-[10px] tracking-[0.05em] text-on-surface-subtle">
                Telemetry console
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-3 pt-5" aria-label="Sections">
            {NAV.map(({ id, label, Icon, active, badge }) => {
              const showBadge = badge && alertCount > 0;
              return (
                <a
                  key={id}
                  href="#"
                  aria-current={active ? 'page' : undefined}
                  aria-disabled={active ? undefined : true}
                  onClick={(e) => !active && e.preventDefault()}
                  className={`relative flex items-center justify-between rounded px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-surface-card text-primary'
                      : 'text-on-surface-muted hover:bg-surface-card/60 hover:text-on-surface'
                  }`}
                >
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
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
              Cloud link
            </span>
            <span className={`text-[12px] font-medium ${link.tone}`}>{link.label}</span>
          </div>

          <div className="flex items-center justify-between rounded border border-border-subtle bg-surface-subtle px-2.5 py-2 shadow-well">
            <LinkTrace alive={alive} colour={alive ? '#22c55e' : '#f87171'} />
            <StatusOrb status={link.status} size={7} />
          </div>

          <dl className="mt-3 space-y-1 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
            <div className="flex justify-between">
              <dt>Node</dt>
              <dd className="text-on-surface-muted">{deviceId ?? 'socket1'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Firmware</dt>
              <dd className="text-on-surface-muted">{fwVersion ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* ── Handheld chassis bar ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-rail px-4 lg:hidden">
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
          <LinkTrace alive={alive} colour={alive ? '#22c55e' : '#f87171'} width={44} />
          <StatusOrb status={link.status} size={7} />
        </div>
      </header>
    </>
  );
}
