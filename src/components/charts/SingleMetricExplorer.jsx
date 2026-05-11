/*
 * Single Metric Explorer - OWID-style grapher for single metric visualization
 * Shows one metric at a time against GDP per capita (x-axis)
 * 
 * Data format: [{ x: gdp_value, metric1: value, metric2: value, year: year }, ...]
 * For selected metric: transforms to [{ x: gdp, y: metric_value, year: year }, ...]
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
import { Slider } from '../ui/Slider';
import { SearchBar } from '../ui/SearchBar';
import { useDimensions } from '../../../hooks/use-dimensions';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const COLORS = d3.schemeTableau10;

// Category colors for consistent styling
const CATEGORY_COLORS = {
    'WISE': COLORS[0],
    'SPI2025': COLORS[1],
    'SPI2023': COLORS[2],
    'GDP': COLORS[3],
    'Population': COLORS[4],
};

// Extract category from metric name
function getCategoryFromName(metricName) {
    if (metricName.startsWith('WISE_')) return 'WISE';
    if (metricName.startsWith('SPI2025_')) return 'SPI2025';
    if (metricName.startsWith('SPI2023_')) return 'SPI2023';
    if (metricName.startsWith('GDP_')) return 'GDP';
    if (metricName.startsWith('POP_')) return 'Population';
    return 'Other';
}

/**
 * Single Metric Explorer
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of data points: [{ x: gdp, metric1: value, year: year }, ...]
 * @param {Array} props.seriesKeys - Array of series names (keys for y-values in data)
 * @param {string} [props.xAxisLabel='GDP per capita (USD)'] - Label for x-axis
 * @param {string} [props.yAxisLabel='Metric Value'] - Label for y-axis
 * @param {string} [props.title=''] - Chart title
 */
export const SingleMetricExplorer = ({
    data,
    seriesKeys,
    xAxisLabel = 'GDP per capita (USD)',
    yAxisLabel = 'Metric Value',
    title = '',
    width = 800,
    height = 500,
}) => {
    // Constants
    const PANE_WIDTH = 200;
    const GAP = 16;
    const MOBILE_BREAKPOINT = 768;
    const MARGIN = { top: 50, right: 30, bottom: 80, left: 60 };
    
    // Responsive layout
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const effectivePaneWidth = isMobileLayout ? 0 : PANE_WIDTH;
    const effectiveGap = isMobileLayout ? 0 : GAP;
    const chartWidth = width - effectivePaneWidth - effectiveGap;
    const chartHeight = isMobileLayout ? height - 250 : height;
    const boundsWidth = chartWidth - MARGIN.left - MARGIN.right;
    const boundsHeight = chartHeight - MARGIN.top - MARGIN.bottom;
    
    // Font sizes based on width
    const titleFontSize = Math.max(14, width * 0.025);
    const axisLabelFontSize = Math.max(12, width * 0.02);
    const tickFontSize = Math.max(10, width * 0.015);
    const itemFontSize = Math.max(11, width * 0.014);
    
    // State
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('value'); // 'value' or 'alphabetical'
    const [xDomain, setXDomain] = useState(null); // Will be set from data
    const [hoveredPoint, setHoveredPoint] = useState(null);
    
    // Get GDP range from data for slider
    const gdpRange = useMemo(() => {
        if (data.length === 0) return [0, 100];
        const allX = data.map(d => d.x).filter(x => x !== null && x !== undefined);
        if (allX.length === 0) return [0, 100];
        const [minX, maxX] = d3.extent(allX);
        return [minX || 0, maxX || 100];
    }, [data]);

    // Get GDP range for selected metric only
    const metricGdpRange = useMemo(() => {
        if (!selectedMetric || data.length === 0) return null;
        const metricX = data
            .filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined && d.x !== null && d.x !== undefined)
            .map(d => d.x);
        if (metricX.length === 0) return null;
        const [minX, maxX] = d3.extent(metricX);
        return [minX || 0, maxX || 100];
    }, [selectedMetric, data]);

    // Update xDomain when selection changes or data loads
    useEffect(() => {
        if (!selectedMetric) {
            // No metric selected: use full GDP range
            if (xDomain === null || (gdpRange[0] !== 0 && gdpRange[1] !== 0)) {
                setXDomain(gdpRange);
            }
        } else {
            // Metric selected: use metric's GDP range
            if (metricGdpRange && (xDomain === null || xDomain[0] === gdpRange[0] && xDomain[1] === gdpRange[1])) {
                setXDomain(metricGdpRange);
            }
        }
    }, [selectedMetric, gdpRange, metricGdpRange, xDomain]);

    // Use xDomain from state (controlled by slider), fall back to appropriate range
    const effectiveXDomain = xDomain || (selectedMetric ? metricGdpRange : gdpRange) || gdpRange;
    
    // Filter data based on x-domain (GDP)
    const filteredData = useMemo(() => {
        return data.filter(d => d.x >= effectiveXDomain[0] && d.x <= effectiveXDomain[1]);
    }, [data, effectiveXDomain]);
    
    // Get last data point for each series (for sorting) - use last by year
    const lastDataPoint = useMemo(() => {
        if (data.length === 0) return {};
        // Sort by year (if available) or by x
        const sortedData = [...data].sort((a, b) => (b.year || b.x) - (a.year || a.x));
        const lastEntry = sortedData[0];
        const result = {};
        seriesKeys.forEach(key => {
            result[key] = lastEntry ? lastEntry[key] : null;
        });
        return result;
    }, [data, seriesKeys]);
    
    // Transform selected metric data: {x: gdp, y: metric_value} array
    const metricData = useMemo(() => {
        if (!selectedMetric) return [];
        return filteredData.map(d => ({
            x: d.x,
            y: d[selectedMetric],
            year: d.year
        })).filter(d => d.y !== null && d.y !== undefined && d.x !== null && d.x !== undefined);
    }, [selectedMetric, filteredData]);
    
    // Calculate y-domain based on selected metric
    const yDomain = useMemo(() => {
        if (metricData.length === 0) return [0, 1];
        const [minY, maxY] = d3.extent(metricData, d => d.y);
        const padding = (maxY - minY) * 0.1; // 10% padding on both sides
        return [
            minY !== undefined ? minY - padding : 0,
            maxY !== undefined ? maxY + padding : 1
        ];
    }, [metricData]);
    
    // X and Y scales
    const xScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([effectiveXDomain[0], effectiveXDomain[1]])
            .range([0, boundsWidth]);
    }, [effectiveXDomain, boundsWidth]);
    
    const yScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain(yDomain)
            .range([boundsHeight, 0]);
    }, [yDomain, boundsHeight]);
    
    // Color for selected metric
    const metricColor = useMemo(() => {
        if (!selectedMetric) return COLORS[0];
        const category = getCategoryFromName(selectedMetric);
        return CATEGORY_COLORS[category] || COLORS[seriesKeys.indexOf(selectedMetric) % 10];
    }, [selectedMetric, seriesKeys]);
    
    // Line generator
    const lineBuilder = useMemo(() => {
        return d3
            .line()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y));
    }, [xScale, yScale]);
    
    // Line path
    const linePath = useMemo(() => {
        if (metricData.length === 0) return null;
        return lineBuilder(metricData);
    }, [metricData, lineBuilder]);
    
    // Select metric
    const handleSelectMetric = useCallback((metric) => {
        setSelectedMetric(prev => prev === metric ? null : metric);
    }, []);
    
    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedMetric(null);
    }, []);
    
    // Filter and sort metric list
    const filteredSeriesKeys = useMemo(() => {
        let result = seriesKeys.filter(key => 
            key.toLowerCase().includes(searchQuery.toLowerCase())
        );
        
        if (sortBy === 'value') {
            result.sort((a, b) => {
                const valA = lastDataPoint[a] || 0;
                const valB = lastDataPoint[b] || 0;
                return valB - valA; // Descending by value
            });
        } else {
            result.sort((a, b) => a.localeCompare(b)); // Alphabetical
        }
        
        return result;
    }, [seriesKeys, searchQuery, sortBy, lastDataPoint]);
    
    // Tooltip handler
    const handleChartMouseMove = useCallback((e) => {
        if (metricData.length === 0) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const xPos = e.clientX - rect.left - MARGIN.left;
        const yPos = e.clientY - rect.top - MARGIN.top;
        
        // Find nearest x value
        const xValue = xScale.invert(xPos);
        const bisect = d3.bisector(d => d.x).left;
        const idx = bisect(metricData, xValue);
        const point = metricData[Math.max(0, Math.min(idx, metricData.length - 1))];
        
        if (point) {
            setHoveredPoint({
                x: xPos + MARGIN.left,
                y: yPos + MARGIN.top,
                data: [{
                    series: selectedMetric,
                    x: point.x,
                    y: point.y,
                    year: point.year,
                    color: metricColor
                }]
            });
        }
    }, [xScale, metricData, selectedMetric, metricColor, MARGIN.left, MARGIN.top]);
    
    const handleChartMouseLeave = useCallback(() => {
        setHoveredPoint(null);
    }, []);
    
    // Get display name (replace underscores with spaces)
    const getDisplayName = (name) => name.replace(/_/g, ' ');
    
    // Format GDP value for display
    const formatGDP = (value) => {
        if (value === null || value === undefined) return 'N/A';
        if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
        return `$${value.toFixed(2)}`;
    };

    // Format y-axis values (generic metric values)
    const formatValue = (value) => {
        if (value === null || value === undefined) return 'N/A';
        // Auto-format based on magnitude
        if (Math.abs(value) >= 1000000) return value.toFixed(0);
        if (Math.abs(value) >= 1000) return value.toFixed(1);
        if (Math.abs(value) >= 1) return value.toFixed(2);
        if (Math.abs(value) >= 0.01) return value.toFixed(3);
        return value.toFixed(4);
    };
    
    return (
        <div className="flex flex-col md:flex-row gap-4" style={{ width, height, fontFamily: FONT_FAMILY }}>
            {/* Main Chart Area */}
            <div className="flex-1 min-w-0" style={{ height: isMobileLayout ? chartHeight + 250 : chartHeight }}>
                <svg 
                    width={chartWidth} 
                    height={chartHeight}
                    onMouseMove={handleChartMouseMove}
                    onMouseLeave={handleChartMouseLeave}
                >
                    {/* Title */}
                    {title && (
                        <text
                            x={chartWidth / 2}
                            y={MARGIN.top - 15}
                            fontSize={titleFontSize}
                            textAnchor="middle"
                            fill="#333"
                            fontWeight="bold"
                            fontFamily={FONT_FAMILY}
                        >
                            {selectedMetric ? getDisplayName(selectedMetric) : title}
                        </text>
                    )}
                    
                    {/* Chart Group */}
                    <g
                        width={boundsWidth}
                        height={boundsHeight}
                        transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}
                    >
                        {/* Grid lines */}
                        <g className="grid-lines">
                            {yScale.ticks(5).map((value) => (
                                <line
                                    key={value}
                                    x1={0}
                                    x2={boundsWidth}
                                    y1={yScale(value)}
                                    y2={yScale(value)}
                                    stroke="#e0e0e0"
                                    strokeWidth={1}
                                />
                            ))}
                        </g>
                        
                        {/* Line */}
                        {linePath && (
                            <path
                                d={linePath}
                                fill="none"
                                stroke={metricColor}
                                strokeWidth={3}
                                style={{ cursor: 'pointer' }}
                            />
                        )}
                        
                        {/* Axes */}
                        <AxisBottom 
                            xScale={xScale} 
                            pixelsPerTick={100} 
                            boundsHeight={boundsHeight} 
                            label={xAxisLabel}
                            showVerticalGrid={false}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                            tickFormat={formatGDP}
                        />
                        <AxisLeft 
                            yScale={yScale} 
                            pixelsPerTick={60} 
                            boundsWidth={boundsWidth} 
                            label={yAxisLabel}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                            tickFormat={formatValue}
                        />
                        
                        {/* Tooltip */}
                        {hoveredPoint && hoveredPoint.data.length > 0 && (
                            <g 
                                transform={`translate(${hoveredPoint.x}, ${hoveredPoint.y})`}
                                pointerEvents="none"
                            >
                                <rect 
                                    x={10} 
                                    y={-10}
                                    width={200} 
                                    height={65}
                                    fill="white"
                                    stroke="#ddd"
                                    strokeWidth={1}
                                    rx={4}
                                    ry={4}
                                />
                                {hoveredPoint.data.map((d, i) => (
                                    <g key={d.series} transform={`translate(15, ${i * 20})`}>
                                        <text 
                                            x={0} 
                                            y={15}
                                            fontSize={11}
                                            fill="#333"
                                            fontFamily={FONT_FAMILY}
                                        >
                                            <tspan x={0} dy={0}>{xAxisLabel}: {formatGDP(d.x)}</tspan>
                                            <tspan x={0} dy={14}>{yAxisLabel}: {d.y.toFixed(4)}</tspan>
                                            <tspan x={0} dy={14}>Year: {d.year}</tspan>
                                        </text>
                                    </g>
                                ))}
                            </g>
                        )}
                    </g>
                </svg>
                
                {/* Slider - GDP range */}
                <div className="mt-4 px-2">
                    <Slider
                        value={effectiveXDomain}
                        min={gdpRange[0]}
                        max={gdpRange[1]}
                        onChange={setXDomain}
                        label="GDP per capita"
                    />
                </div>
            </div>
            
            {/* Side Pane */}
            <div className={`w-full md:w-[200px] bg-white border-l border-gray-200 p-4 rounded-lg shadow-sm overflow-y-auto ${isMobileLayout ? 'order-first' : ''}`}>
                {/* Search Bar */}
                <div className="mb-4">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search for a metric"
                    />
                </div>
                
                {/* Sort Dropdown */}
                <div className="mb-4">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        style={{ fontFamily: FONT_FAMILY }}
                    >
                        <option value="value">Sort by: Value (last year)</option>
                        <option value="alphabetical">Sort by: Alphabetical</option>
                    </select>
                </div>
                
                {/* Selection Info */}
                <div className="mb-4 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700" style={{ fontSize: itemFontSize }}>
                        {selectedMetric ? getDisplayName(selectedMetric) : 'No metric selected'}
                    </span>
                    {selectedMetric && (
                        <button
                            onClick={clearSelection}
                            className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                            style={{ fontFamily: FONT_FAMILY }}
                        >
                            Clear
                        </button>
                    )}
                </div>
                
                {/* Metric List - Single selection */}
                <div className="space-y-1">
                    {filteredSeriesKeys.map((key) => {
                        const isSelected = selectedMetric === key;
                        const category = getCategoryFromName(key);
                        const color = CATEGORY_COLORS[category] || COLORS[seriesKeys.indexOf(key) % 10];
                        
                        return (
                            <div 
                                key={key}
                                className={`flex items-center gap-2 p-1 rounded cursor-pointer transition-colors ${
                                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                                onClick={() => handleSelectMetric(key)}
                            >
                                {/* Color indicator */}
                                <div 
                                    className="w-4 h-4 rounded border-2 shrink-0"
                                    style={{
                                        borderColor: color,
                                        backgroundColor: isSelected ? color : 'transparent'
                                    }}
                                />
                                
                                {/* Metric name */}
                                <span 
                                    className="flex-1 text-sm truncate"
                                    style={{
                                        fontSize: itemFontSize,
                                        fontWeight: isSelected ? 'bold' : 'normal'
                                    }}
                                >
                                    {getDisplayName(key)}
                                </span>
                                
                                {/* Latest value */}
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {lastDataPoint[key] !== null && lastDataPoint[key] !== undefined 
                                        ? lastDataPoint[key].toFixed(2) 
                                        : 'N/A'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                
                {/* No results */}
                {filteredSeriesKeys.length === 0 && (
                    <div className="text-center text-sm text-gray-500 py-4">
                        No metrics match your search
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Responsive wrapper for SingleMetricExplorer
 */
export const ResponsiveSingleMetricExplorer = ({ width = 800, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    
    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;
    
    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <SingleMetricExplorer
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};

export default SingleMetricExplorer;
