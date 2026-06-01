/*
 * Simple Switch/Toggle component
 * Used for toggling options in chart components
 */

/**
 * Switch component
 * @param {Object} props
 * @param {boolean} props.checked - Whether switch is on
 * @param {Function} props.onChange - Callback when state changes
 * @param {string} [props.label] - Optional label text
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Inline styles
 */
export const Switch = ({ checked = true, onChange, label, className = '', style = {}, ...props }) => {
    return (
        <label className={`flex items-center gap-2 cursor-pointer ${className}`} style={style}>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange && onChange(!checked)}
                className="border-2 border-blue-500 relative inline-flex items-center rounded-full w-10 h-5 transition-colors focus:outline-none"
                style={{
                    backgroundColor: checked ? '#3b82f6' : '#e5e7eb'
                }}
            >
                <span
                    className="inline-block rounded-full bg-white shadow w-4 h-4 transform transition-transform"
                    style={{
                        transform: checked ? 'translateX(22px)' : 'translateX(3px)'
                    }}
                />
            </button>
            {label && <span className="xl:text-xs 2xl:text-sm select-none">{label}</span>}
        </label>
    );
};

export default Switch;
