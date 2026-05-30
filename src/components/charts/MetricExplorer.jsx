/*
 * Metric Explorer - OWID-style grapher component (DEPRECATED)
 * 
 * ⚠️  DEPRECATED: This component is designed for multi-metric visualization.
 * Use SingleMetricExplorer.jsx instead for the PA_UNIL project (single metric at a time).
 * 
 * Data-agnostic line chart with series selection, search, sort, and range slider
 */
import { useState, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { Checkbox } from '../custom_ui/Checkbox.jsx';
import { AxisLeft } from '../Axes/AxisLeft.jsx';
import { AxisBottom } from '../Axes/AxisBottom.jsx';
import { Slider } from '../custom_ui/Slider.jsx';
import { SearchBar } from '../custom_ui/SearchBar.jsx';
import { useDimensions } from '../../../hooks/use-dimensions.js';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const COLORS = d3.schemeTableau10;

/**
 * Metric Explorer - OWID-style interactive chart
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of data points: [{ x: number, y1: number, y2: number, ... }, ...]
 * @param {Array} props.seriesKeys - Array of series names (keys for y-values in data)
 * @param {string} [props.xAxisLabel='Year'] - Label for x-axis
 * @param {string} [props.yAxisLabel='Value'] - Label for y-axis
 * @param {string} [props.title=''] - Chart title
 * @param {number} [props.sliderMin] - Min x-value (default: min(data.x))
 * @param {number} [props.sliderMax] - Max x-value (default: max(data.x))
 * @param {string} [props.sliderLabel='Year'] - Label for slider
 * @param {Function} [props.colorScale] - Custom D3 color scale (default: d3.schemeTableau10)
 * @param {number} [props.width] - Container width
 * @param {number} [props.height] - Container height
 */
export const MetricExplorer = ({
    data,
    seriesKeys,
    xAxisLabel = 'Year',
    yAxisLabel = 'Value',
    title = '',
    sliderMin,
    sliderMax,
    sliderLabel = 'Year',
    colorScale = d3.scaleOrdinal(COLORS),
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
    const checkboxFontSize = Math.max(11, width * 0.014);
    
    // Set color domain
    colorScale.domain(seriesKeys);
    
    // State
    const [visibleSeries, setVisibleSeries] = useState(() => new Set(seriesKeys));
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('value'); // 'value' or 'alphabetical'
    const [xDomain, setXDomain] = useState([sliderMin || 0, sliderMax || 100]);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    
    // Get last data point for each series (for sorting)
    const lastDataPoint = useMemo(() => {
        if (data.length === 0) return {};
        const lastX = d3.max(data, d => d.x);
        const result = {};
        seriesKeys.forEach(key => {
            const lastEntry = data.find(d => d.x === lastX);
            result[key] = lastEntry ? lastEntry[key] : null;
        });
        return result;
    }, [data, seriesKeys]);
    
    // Calculate x domain from data if not provided
    const fullXDomain = useMemo(() => {
        const [minX, maxX] = d3.extent(data, d => d.x);
        return [minX || 0, maxX || 0];
    }, [data]);
    
    const effectiveSliderMin = sliderMin !== undefined ? sliderMin : fullXDomain[0];
    const effectiveSliderMax = sliderMax !== undefined ? sliderMax : fullXDomain[1];
    
    // Filter data based on x-domain
    const filteredData = useMemo(() => {
        return data.filter(d => d.x >= xDomain[0] && d.x <= xDomain[1]);
    }, [data, xDomain]);
    
    // Process series data
    const seriesData = useMemo(() => {
        return seriesKeys.map((key) => {
            return filteredData.map((d) => ({
                x: d.x,
                y: d[key],
                series: key
            }));
        });
    }, [seriesKeys, filteredData]);
    
    // Calculate max Y value for visible series
    const maxY = useMemo(() => {
        if (visibleSeries.size === 0) return 0;
        let max = 0;
        seriesKeys.forEach((key, i) => {
            if (visibleSeries.has(key)) {
                const seriesMax = d3.max(seriesData[i], d => d.y);
                if (seriesMax !== undefined && seriesMax > max) {
                    max = seriesMax;
                }
            }
        });
        return max * 1.1; // 10% padding
    }, [visibleSeries, seriesKeys, seriesData]);
    
    // X and Y scales
    const xScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([xDomain[0], xDomain[1]])
            .range([0, boundsWidth]);
    }, [xDomain, boundsWidth]);
    
    const yScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([0, maxY || 1])
            .range([boundsHeight, 0]);
    }, [maxY, boundsHeight]);
    
    // Line generator
    const lineBuilder = useMemo(() => {
        return d3
            .line()
            .x((d) => xScale(d.x))
            .y((d) => yScale(d.y))
            .defined(d => d.y !== null && d.y !== undefined);
    }, [xScale, yScale]);
    
    // Visible lines
    const visibleLines = useMemo(() => {
        return seriesData.map((serie, i) => {
            const key = seriesKeys[i];
            if (!visibleSeries.has(key)) return null;
            
            return (
                <path
                    key={key}
                    d={lineBuilder(serie)}
                    fill="none"
                    stroke={colorScale(key)}
                    strokeWidth={2}
                    onMouseEnter={() => setHoveredPoint(key)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    style={{ cursor: 'pointer' }}
                />
            );
        }).filter(Boolean);
    }, [seriesData, seriesKeys, visibleSeries, lineBuilder, colorScale]);
    
    // Toggle series visibility
    const toggleSeries = useCallback((key) => {
        setVisibleSeries(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    }, []);
    
    // Clear all selections
    const clearAll = useCallback(() => {
        setVisibleSeries(new Set());
    }, []);
    
    // Filter and sort checkbox items
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
        if (!filteredData.length || visibleSeries.size === 0) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const xPos = e.clientX - rect.left - MARGIN.left;
        const yPos = e.clientY - rect.top - MARGIN.top;
        
        // Find nearest x value
        const xValue = xScale.invert(xPos);
        const bisect = d3.bisector(d => d.x).left;
        
        // For each visible series, find the point
        const tooltipData = [];
        seriesKeys.forEach((key, i) => {
            if (!visibleSeries.has(key)) return;
            const idx = bisect(seriesData[i], xValue);
            const point = seriesData[i][Math.max(0, Math.min(idx, seriesData[i].length - 1))];
            if (point && point.y !== null && point.y !== undefined) {
                tooltipData.push({
                    series: key,
                    x: point.x,
                    y: point.y,
                    color: colorScale(key)
                });
            }
        });
        
        setHoveredPoint({ x: xPos + MARGIN.left, y: yPos + MARGIN.top, data: tooltipData });
    }, [xScale, filteredData, visibleSeries, seriesKeys, seriesData, colorScale, MARGIN.left, MARGIN.top]);
    
    const handleChartMouseLeave = useCallback(() => {
        setHoveredPoint(null);
    }, []);
    
    // Count selected series
    const selectedCount = visibleSeries.size;
    
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
                    <text
                        x={chartWidth / 2}
                        y={MARGIN.top - 15}
                        fontSize={titleFontSize}
                        textAnchor="middle"
                        fill="#333"
                        fontWeight="bold"
                        fontFamily={FONT_FAMILY}
                    >
                        {title}
                    </text>
                    
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
                        
                        {/* Lines */}
                        {visibleLines}
                        
                        {/* Axes */}
                        <AxisBottom 
                            xScale={xScale} 
                            pixelsPerTick={100} 
                            boundsHeight={boundsHeight} 
                            label={xAxisLabel}
                            showVerticalGrid={false}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                        />
                        <AxisLeft 
                            yScale={yScale} 
                            pixelsPerTick={60} 
                            boundsWidth={boundsWidth} 
                            label={yAxisLabel}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
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
                                    width={180} 
                                    height={hoveredPoint.data.length * 22 + 10}
                                    fill="white"
                                    stroke="#ddd"
                                    strokeWidth={1}
                                    rx={4}
                                    ry={4}
                                />
                                {hoveredPoint.data.map((d, i) => (
                                    <g key={d.series} transform={`translate(15, ${i * 22})`}>
                                        <circle cx={0} cy={11} r={4} fill={d.color} />
                                        <text 
                                            x={8} 
                                            y={15}
                                            fontSize={11}
                                            fill="#333"
                                            fontFamily={FONT_FAMILY}
                                        >
                                            <tspan x={8} dy={0}>{d.series}</tspan>
                                            <tspan x={8} dy={14}>{xAxisLabel}: {d.x}, {yAxisLabel}: {d.y.toFixed(2)}</tspan>
                                        </text>
                                    </g>
                                ))}
                            </g>
                        )}
                    </g>
                </svg>
                
                {/* Slider */}
                <div className="mt-4 px-2">
                    <Slider
                        value={xDomain}
                        min={effectiveSliderMin}
                        max={effectiveSliderMax}
                        onChange={setXDomain}
                        label={sliderLabel}
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
                        placeholder="Search for a series"
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
                
                {/* Selection Counter */}
                <div className="mb-4 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700" style={{ fontSize: checkboxFontSize }}>
                        Selection ({selectedCount})
                    </span>
                    <button
                        onClick={clearAll}
                        className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        style={{ fontFamily: FONT_FAMILY }}
                    >
                        Clear
                    </button>
                </div>
                
                {/* Checkbox List */}
                <div className="space-y-1">
                    {filteredSeriesKeys.map((key) => (
                        <div 
                            key={key}
                            className="flex items-center gap-2 p-1 rounded hover:bg-gray-50 transition-colors"
                            onClick={() => toggleSeries(key)}
                        >
                            <Checkbox
                                id={`series-${key}`}
                                checked={visibleSeries.has(key)}
                                onCheckedChange={() => toggleSeries(key)}
                                className="w-4 h-4"
                                style={{
                                    borderColor: colorScale(key),
                                    backgroundColor: visibleSeries.has(key) ? colorScale(key) : 'transparent'
                                }}
                            />
                            <label 
                                htmlFor={`series-${key}`}
                                className="flex-1 text-sm truncate cursor-pointer"
                                style={{
                                    fontSize: checkboxFontSize,
                                    fontWeight: visibleSeries.has(key) ? 'bold' : 'normal',
                                    fontFamily: FONT_FAMILY
                                }}
                            >
                                {key.replace(/_/g, ' ')}
                            </label>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                {lastDataPoint[key] !== null && lastDataPoint[key] !== undefined 
                                    ? lastDataPoint[key].toFixed(2) 
                                    : 'N/A'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * Responsive wrapper for MetricExplorer
 */
export const ResponsiveMetricExplorer = ({ width = 800, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    
    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;
    
    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <MetricExplorer
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};

export default MetricExplorer;
