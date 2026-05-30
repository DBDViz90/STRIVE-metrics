/*
 * Search input component for filtering series list
 */
import { forwardRef } from 'react';

/**
 * Search input for filtering the checkbox list
 * @param {Object} props
 * @param {string} props.value - Current search query
 * @param {Function} props.onChange - Callback with new query
 * @param {string} props.placeholder - Placeholder text
 */
export const SearchBar = forwardRef(({ value, onChange, placeholder = 'Search for a series', style }, ref) => {
    return (
        <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 bg-white"
            style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                ...style
            }}
        />
    );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar;
