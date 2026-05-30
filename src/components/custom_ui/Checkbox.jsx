/*
 * Simple Checkbox component (shadcn-style)
 * Used for series selection in the MetricExplorer
 */
import { forwardRef } from 'react';

/**
 * Checkbox component
 * @param {Object} props
 * @param {boolean} props.checked - Whether checkbox is checked
 * @param {Function} props.onCheckedChange - Callback when checked state changes
 * @param {string} props.id - HTML id attribute
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Inline styles
 */
export const Checkbox = forwardRef(({ checked, onCheckedChange, id, className = '', style = {}, ...props }, ref) => {
    const baseClasses = 'w-4 h-4 rounded border-2 cursor-pointer transition-colors';
    const combinedClasses = `${baseClasses} ${className}`;
    
    return (
        <button
            ref={ref}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onCheckedChange(!checked)}
            className={combinedClasses}
            style={style}
            {...props}
        >
            {checked && (
                <svg
                    className="w-full h-full"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="4,8 8,12 12,4" />
                </svg>
            )}
        </button>
    );
});

Checkbox.displayName = 'Checkbox';

export default Checkbox;
