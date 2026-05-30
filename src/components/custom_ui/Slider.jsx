/*
 * Range slider component for x-axis filtering
 * Uses native HTML range input for simplicity (no external dependencies)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const TRACK_HEIGHT = 4;
const HANDLE_SIZE = 16;

/**
 * Dual-handle range slider for filtering x-axis domain
 * @param {Object} props
 * @param {number[]} props.value - [min, max] current range
 * @param {number} props.min - Absolute minimum value
 * @param {number} props.max - Absolute maximum value
 * @param {Function} props.onChange - Callback with new [min, max]
 * @param {string} props.label - Optional label for the slider (e.g., "Year")
 * @param {string} props.unit - Optional unit suffix for values (e.g., "$USD", "")
 */
export const Slider = ({ value, min, max, onChange, label = 'Year', unit = '$USD' }) => {
    const [isDragging, setIsDragging] = useState(null); // 'min', 'max', or null
    const dragHandleRef = useRef(null);
    const containerRef = useRef(null);
    const minHandleRef = useRef(null);
    const maxHandleRef = useRef(null);

    // Convert value to percentage for positioning
    const toPercent = useCallback((val) => {
        if (max === min) return 0;
        return ((val - min) / (max - min)) * 100;
    }, [min, max]);

    // Convert percentage back to value
    const toValue = useCallback((percent) => {
        return min + (percent / 100) * (max - min);
    }, [min, max]);

    // Handle mouse/touch start on handles
    const handleDragStart = (handle) => (e) => {
        e.preventDefault();
        dragHandleRef.current = handle;
        setIsDragging(handle);
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchmove', handleDrag);
        document.addEventListener('touchend', handleDragEnd);
    };

    // Handle drag movement
    const handleDrag = useCallback((e) => {
        if (!dragHandleRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const percent = ((clientX - rect.left) / rect.width) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));
        const newValue = toValue(clampedPercent);

        if (dragHandleRef.current === 'min') {
            const newMin = Math.min(newValue, value[1]);
            onChange([newMin, value[1]]);
        } else if (dragHandleRef.current === 'max') {
            const newMax = Math.max(newValue, value[0]);
            onChange([value[0], newMax]);
        }
    }, [value, onChange, toValue]);

    // Handle drag end
    const handleDragEnd = useCallback(() => {
        dragHandleRef.current = null;
        setIsDragging(null);
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('touchend', handleDragEnd);
    }, [handleDrag]);

    // Prevent handle overlap
    useEffect(() => {
        if (value[0] > value[1]) {
            onChange([value[1], value[0]]);
        }
    }, [value, onChange]);

    const minPercent = toPercent(value[0]);
    const maxPercent = toPercent(value[1]);

    return (
        <div className="w-full" ref={containerRef}>
            <div className="flex justify-between mb-2">
                <span className="text-xs text-gray-500">{label}</span>
                <div className="flex gap-2">
                    <span className="text-xs text-gray-600 font-medium">{Math.round(value[0])} {unit}</span>
                    <span className="text-xs text-gray-500">to</span>
                    <span className="text-xs text-gray-600 font-medium">{Math.round(value[1])} {unit}</span>
                </div>
            </div>
            
            {/* Track background */}
            <div 
                className="relative h-[4px] bg-gray-200 rounded-full cursor-pointer"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percent = (clickX / rect.width) * 100;
                    const newValue = toValue(percent);
                    
                    // Click closer to min or max?
                    const midPoint = toPercent((value[0] + value[1]) / 2);
                    if (percent < midPoint) {
                        onChange([newValue, value[1]]);
                    } else {
                        onChange([value[0], newValue]);
                    }
                }}
            >
                {/* Active track (between handles) */}
                <div
                    className="absolute h-full bg-blue-500 rounded-full"
                    style={{
                        left: `${minPercent}%`,
                        width: `${maxPercent - minPercent}%`
                    }}
                />

                {/* Min handle */}
                <div
                    ref={minHandleRef}
                    className="absolute w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                    style={{
                        left: `calc(${minPercent}% - 8px)`,
                        top: '-6px'
                    }}
                    onMouseDown={handleDragStart('min')}
                    onTouchStart={handleDragStart('min')}
                />

                {/* Max handle */}
                <div
                    ref={maxHandleRef}
                    className="absolute w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                    style={{
                        left: `calc(${maxPercent}% - 8px)`,
                        top: '-6px'
                    }}
                    onMouseDown={handleDragStart('max')}
                    onTouchStart={handleDragStart('max')}
                />
            </div>
        </div>
    );
};

export default Slider;
