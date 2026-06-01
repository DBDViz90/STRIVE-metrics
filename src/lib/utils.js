/*
 * Utility functions
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Get tooltip position offsets based on screen size using window.matchMedia
 * Matches Tailwind's xl (1280px) and 2xl (1536px) breakpoints
 * @param {string} chartType - 'scatter', 'line', or 'multiline' to use different configurations
 */
export function getTooltipOffsets(chartType = 'scatter') {
  const isXl = window.matchMedia('(min-width: 1280px)').matches;
  const is2Xl = window.matchMedia('(min-width: 1536px)').matches;

  const configs = {
    scatter: {
      '2xl': { leftOffset: 0.95, rightOffset: 0.85 },
      xl:     { leftOffset: 0.95, rightOffset: 0.55 },
      default: { leftOffset: 0.95, rightOffset: 0.55 }
    },
    line: {
      '2xl': { leftOffset: 0.95, rightOffset: 0.70 },
      xl:     { leftOffset: 0.95, rightOffset: 0.4 },
      default: { leftOffset: 0.95, rightOffset: 0.70 }
    },
    multiline: {
      '2xl': { rightEdgeDistance: 450 },
      xl:     { rightEdgeDistance: 300 },
      default: { rightEdgeDistance: 25 }
    }
  };

  const c = configs[chartType];
  if (is2Xl) return c['2xl'];
  if (isXl) return c.xl;
  return c.default;
}
