// Adapted from SmoothUI AnimatedTabs, Eduardo Calvo (MIT).
// Uses filter-button semantics because these filter one table, not tab panels.
import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
export function AnimatedFilters({ value, onChange }) {
  const id = useId(); const reduced = useReducedMotion();
  const options = [{ id: 'all', label: 'All keys' }, { id: 'expiring', label: 'Expiring' }];
  return <div className="filter-group" role="group" aria-label="Filter keys">
    {options.map((option, index) => <button key={option.id} aria-pressed={value === option.id} id={`${id}-${option.id}`} onClick={() => onChange(option.id)} onKeyDown={e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const next = options[(index + 1) % options.length]; onChange(next.id); document.getElementById(`${id}-${next.id}`)?.focus(); }
    }}>{value === option.id && <motion.span className="filter-indicator" layoutId={id} transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.05, duration: 0.25 }}/>}<span className="filter-text">{option.label}</span></button>)}
  </div>;
}
