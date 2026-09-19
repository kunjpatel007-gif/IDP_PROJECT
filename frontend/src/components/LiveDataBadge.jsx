import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import StatusOrb from '@/components/StatusOrb';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Packet counter.
 *
 * Every Firestore snapshot pops this badge once. It is the cheapest possible
 * proof that the pipe is live: if the number stops moving, the hardware
 * stopped talking, and you know that before any status field catches up.
 */
export default function LiveDataBadge({ seq, snapshotCount, connected, silentFor }) {
  const reduced = useReducedMotion();
  const [pop, setPop] = useState(false);
  const lastCount = useRef(snapshotCount);

  useEffect(() => {
    if (snapshotCount === lastCount.current) return undefined;
    lastCount.current = snapshotCount;
    if (reduced) return undefined;
    setPop(true);
    const t = setTimeout(() => setPop(false), 440);
    return () => clearTimeout(t);
  }, [snapshotCount, reduced]);

  const seconds = silentFor == null ? null : Math.floor(silentFor / 1000);

  return (
    <motion.div
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-5 right-5 z-50 hidden items-center gap-2.5 border border-border-muted bg-surface-card/95 px-3 py-2 shadow-flyout backdrop-blur-sm sm:flex"
    >
      <StatusOrb status={connected ? 'online' : 'offline'} size={7} />
      <div className={`flex items-baseline gap-2 ${pop ? 'seq-pop' : ''}`}>
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
          pkt
        </span>
        <span className="font-mono text-[13px] font-medium text-on-surface">
          {seq != null ? String(seq).padStart(4, '0') : '––––'}
        </span>
      </div>
      <span className="h-3 w-px bg-border-muted" />
      <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
        {seconds == null ? 'no sync' : `${seconds}s`}
      </span>
    </motion.div>
  );
}
