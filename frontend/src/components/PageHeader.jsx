/**
 * Page header.
 *
 * Every tab used to open with a bare `<h1>` except Overview, which had the
 * proximity treatment. That inconsistency read as one screen being finished
 * and three being stubs. They all get the same opening now: the title, a
 * single line saying what the screen is actually for, and a right-hand meta
 * cluster carrying the two facts that stay true across every tab — wall clock
 * and how long this session has been accumulating.
 *
 * The rule underneath is amber at the origin and fades to nothing by the
 * right margin. It is the one piece of pure ornament in the build, and it
 * earns its place by making the eye start at the left edge every time.
 */
export default function PageHeader({ title, lede, meta }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-display text-[23px] font-semibold tracking-tight text-on-surface lg:text-[28px]">
            {title}
          </h1>
          {lede ? (
            <p className="mt-1.5 max-w-[58ch] text-[12.5px] leading-[19px] text-on-surface-muted">
              {lede}
            </p>
          ) : null}
        </div>

        {meta ? (
          <div className="flex shrink-0 items-center gap-4 pb-0.5">{meta}</div>
        ) : null}
      </div>

      <div className="rule-fade mt-4" aria-hidden="true" />
    </header>
  );
}

/** One labelled figure in the header's meta cluster. */
export function HeaderMeta({ label, value, tone = 'text-on-surface-muted' }) {
  return (
    <div className="text-right leading-none">
      <p className="panel-label text-on-surface-subtle">{label}</p>
      <p className={`mt-1.5 font-mono text-[13px] tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}
