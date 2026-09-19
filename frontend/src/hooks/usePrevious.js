import { useEffect, useRef } from 'react';

/**
 * Value from the previous render. Edge detection (false → true on `tripped`)
 * is how the trip overlay knows a breaker just opened rather than that it has
 * merely been open the whole time.
 */
export function usePrevious(value) {
  const ref = useRef(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
