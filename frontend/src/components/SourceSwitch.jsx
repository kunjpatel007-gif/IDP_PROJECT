import { clearMockFromUrl } from '@/firebase';
import WarmTooltip, { WarmTooltipGroup } from '@/components/WarmTooltip';

/**
 * Data source selector.
 *
 * The console can run against the adapter or against the rehearsal generator,
 * and the choice is live — switching tears down one subscription and opens the
 * other without a reload. Selecting Adapter also strips `?mock=` from the
 * address bar, so a refresh does not silently drop back into rehearsal.
 *
 * It is deliberately prominent and permanently visible. A dashboard showing
 * synthetic numbers that looks identical to one showing real ones is a trap,
 * especially in front of an examiner.
 */
export default function SourceSwitch({ source, onChange, live }) {
  const select = (next) => {
    if (next === source) return;
    if (next === 'live') clearMockFromUrl();
    onChange(next);
  };

  return (
    <div className="inline-flex items-stretch border border-border-muted bg-surface-subtle shadow-well">
      <span className="flex items-center border-r border-border-subtle px-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-subtle">
        Source
      </span>

      <WarmTooltipGroup delay={300} warmWindow={300} travel={300} lean={0}>
        {[
          { id: 'live', label: 'Adapter', tip: 'Connect to real ESP32 hardware' },
          { id: 'mock', label: 'Rehearsal', tip: 'Use synthetic telemetry generator' },
        ].map((option) => {
          const active = source === option.id;
          return (
            <WarmTooltip
              key={option.id}
              content={option.tip}
              side="bottom"
              surfaceColor="#17191e"
              inkColor="#f5f5f5"
              size="sm"
              radius={2}
              gap={6}
              arrow
              popDuration={160}
              popScale={0.94}
              popBlur={4}
              showFuse={false}
            >
              <button
                type="button"
                onClick={() => select(option.id)}
                aria-pressed={active}
                className={`relative h-8 px-3 font-mono text-[11px] tracking-[0.04em] transition-colors ${
                  active
                    ? 'bg-surface-card-hover text-on-surface'
                    : 'text-on-surface-subtle hover:bg-surface-card hover:text-on-surface-muted'
                }`}
              >
                {option.label}
                {active ? (
                  <span
                    className={`absolute inset-x-0 bottom-0 h-[2px] ${
                      option.id === 'mock' ? 'bg-accent-amber' : 'bg-primary'
                    }`}
                  />
                ) : null}
              </button>
            </WarmTooltip>
          );
        })}
      </WarmTooltipGroup>

      {source === 'mock' ? (
        <span className="flex items-center border-l border-border-subtle px-2.5 font-mono text-[10px] tracking-[0.06em] text-accent-amber">
          SYNTHETIC DATA
        </span>
      ) : (
        <span className="flex items-center border-l border-border-subtle px-2.5 font-mono text-[10px] tracking-[0.06em] text-on-surface-subtle">
          {live ? 'ESP32 · LIVE' : 'ESP32 · WAITING'}
        </span>
      )}
    </div>
  );
}
