// Adapted from Magic UI Number Ticker (MIT). See THIRD_PARTY_NOTICES.md.
// Local adaptation: live values, no viewport delay, reduced-motion support.
import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useReducedMotion } from 'motion/react';
export function NumberTicker({ value }) {
  const ref = useRef(null);
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { if (ref.current) ref.current.textContent = String(value); return; }
    motionValue.set(value);
    return springValue.on('change', n => { if (ref.current) ref.current.textContent = Math.round(n).toLocaleString(); });
  }, [value, reduced, motionValue, springValue]);
  return <span ref={ref} aria-label={String(value)}>{value}</span>;
}
