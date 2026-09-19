import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IconCheck, IconClose, IconWarning } from '@/components/Icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Command feedback.
 *
 * Each toast carries a hairline that drains over its lifetime, so the panel
 * tells you how long the acknowledgement has left rather than vanishing
 * without warning. Errors state what failed and what to do, in the console's
 * own voice — they do not apologise.
 */

const ToastContext = createContext(null);

const TONES = {
  ok: {
    border: 'border-accent-green/35',
    accent: '#22c55e',
    text: 'text-accent-green',
  },
  error: {
    border: 'border-accent-red/40',
    accent: '#f87171',
    text: 'text-accent-red',
  },
  info: {
    border: 'border-border-muted',
    accent: '#d97736',
    text: 'text-primary-soft',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = 'info', title, detail = null, ttl = 5200 }) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((list) => [...list.slice(-3), { id, tone, title, detail, ttl }]);
      setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
  const reduced = useReducedMotion();

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[70] flex w-[min(340px,calc(100vw-2.5rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast, index) => {
          const tone = TONES[toast.tone] ?? TONES.info;
          const depth = toasts.length - 1 - index;
          return (
            <motion.div
              key={toast.id}
              layout={!reduced}
              initial={
                reduced ? { opacity: 1 } : { opacity: 0, x: 24, scale: 0.97, filter: 'blur(6px)' }
              }
              animate={{
                opacity: 1 - depth * 0.18,
                x: 0,
                scale: 1 - depth * 0.03,
                filter: 'blur(0px)',
              }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.97 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto relative overflow-hidden rounded border bg-surface-card shadow-flyout ${
                toast.tone === 'error' && !reduced ? 'toast-shake' : ''
              } ${tone.border}`}
            >
              {toast.tone === 'ok' ? (
                <motion.span
                  className="absolute inset-y-0 left-0 w-[3px] bg-accent-green"
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={{ opacity: [0, 1, 0.45], scaleY: 1 }}
                  transition={{ duration: 0.5 }}
                />
              ) : null}
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <span className={`mt-[1px] ${tone.text}`}>
                  {toast.tone === 'error' ? (
                    <IconWarning width={14} height={14} />
                  ) : (
                    <IconCheck width={14} height={14} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-mono text-[12px] leading-[16px] ${tone.text}`}>{toast.title}</p>
                  {toast.detail ? (
                    <p className="mt-1 text-[11px] leading-[15px] text-on-surface-muted">{toast.detail}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Dismiss"
                  className="-m-1.5 p-1.5 text-on-surface-subtle transition-colors hover:text-on-surface"
                >
                  <IconClose width={13} height={13} />
                </button>
              </div>

              {/* Time remaining */}
              <motion.div
                className="h-px origin-left"
                style={{ background: tone.accent, opacity: 0.55 }}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: toast.ttl / 1000, ease: 'linear' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
