/*
 * Scatterplot with Regression Line
 * Displays data points (GDP vs metric) with best-fit regression curve
 * Supports: linear, logarithmic, Michaelis-Menten, universal saturation models...
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
import { Slider } from '../ui/Slider';
import { SearchBar } from '../ui/SearchBar';
import { useDimensions } from '../../../hooks/use-dimensions';
import { loadMetadata } from '../../lib/data-loader';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const COLORS = d3.schemeTableau10;

// Category colors for consistent styling.
const CATEGORY_COLORS = {
    'WISE': COLORS[0],
    'SPI2025': COLORS[1],
    'SPI2023': COLORS[3],
    'GDP': COLORS[9],
    'Population': COLORS[9],
};

function getCategoryFromName(metricName) {
    if (metricName.startsWith('WISE_')) return 'WISE';
    if (metricName.startsWith('SPI2025_')) return 'SPI2025';
    if (metricName.startsWith('SPI2023_')) return 'SPI2023';
    if (metricName.startsWith('GDP_')) return 'GDP';
    if (metricName.startsWith('POP_')) return 'Population';
    return 'Other';
}

/**
 * Format metric name with database suffix in parentheses
 * e.g., "WISE_Composite Measure of Wellbeing" → "Composite Measure of Wellbeing (WISE)"
 */
function formatMetricName(name) {
    const dbPrefix = getCategoryFromName(name);
    if (dbPrefix === 'Other') return name.replace(/_/g, ' ');
    // Extract the actual prefix from the name (before first underscore)
    const prefixMatch = name.match(/^([A-Z0-9]+)_/);
    const actualPrefix = prefixMatch ? prefixMatch[1] : '';
    // Remove the actual prefix and add the category name at the end in parentheses
    const cleanName = name.replace(new RegExp(`^${actualPrefix}_`), '').replace(/_/g, ' ');
    // Capitalize first letter, lowercase the rest
    const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
    return `${formattedName} (${dbPrefix.toUpperCase()})`;
}

/**
 * Get R² value for a regression result
 * Maps model names to actual JSON column names
 */
function getR2Value(regression) {
    if (!regression) return null;
    const model = regression.best_model;
    // Map model names to JSON column names (some use abbreviations)
    const modelToCol = {
        'linear': 'r2_linear',
        'logarithmic': 'r2_log',
        'michaelis_menten': 'r2_mm',
        'exp_saturating': 'r2_expsat'
    };
    // For specific models, use their R² column
    if (modelToCol[model]) {
        return regression[modelToCol[model]];
    }
    // For 'other' and 'constant', return the best R² among all models
    return Math.max(
        regression.r2_linear || 0,
        regression.r2_log || 0,
        regression.r2_mm || 0,
        regression.r2_expsat || 0
    );
}

/**
 * Generate points for a regression line/curve
 * @param {string} modelType - 'linear', 'logarithmic', 'michaelis_menten', 'exp_saturating'
 * @param {Object} params - Model parameters
 * @param {number[]} xRange - [minX, maxX] for generating points
 * @param {number} numPoints - Number of points to generate
 * @returns {Array<{x: number, y: number}>} - Array of curve points
 */
function generateRegressionPoints(modelType, params, xRange, numPoints = 100) {
    if (!params || !xRange) return [];
    
    const [minX, maxX] = xRange;
    const step = (maxX - minX) / (numPoints - 1);
    const points = [];
    
    for (let i = 0; i < numPoints; i++) {
        const x = minX + step * i;
        let y = null;
        
        switch (modelType) {
            case 'linear':
                y = params.lin_slope * x + params.lin_intercept;
                break;
            case 'logarithmic':
                y = params.log_a + params.log_b * Math.log(x);
                break;
            case 'michaelis_menten':
                y = (params.mm_vmax * x) / (params.mm_km + x);
                break;
            case 'exp_saturating':
                y = params.sat_a + params.sat_c * (1 - Math.exp(-params.sat_b * x));
                break;
            case 'constant':
                // For constant model, use the mean y value from linear intercept
                y = params.lin_intercept || 0;
                break;
            default:
                // Other models - try linear as fallback
                if (params.lin_slope !== undefined) {
                    y = params.lin_slope * x + params.lin_intercept;
                }
        }
        
        if (y !== null && !isNaN(y) && isFinite(y)) {
            points.push({ x, y });
        }
    }
    
    return points;
}

/**
 * Scatterplot with Regression Line
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of data points: [{ x: gdp, metric1: value, year: year }, ...]
 * @param {Array} props.seriesKeys - Array of series names
 * @param {Array} props.regressionResults - Regression results with parameters
 * @param {string} [props.xAxisLabel='GDP per capita ($USD)'] - Label for x-axis
 * @param {string} [props.yAxisLabel='Metric Value'] - Label for y-axis
 * @param {string} [props.title=''] - Chart title
 */
export const ScatterplotWithRegression = ({
    data,
    seriesKeys,
    regressionResults,
    xAxisLabel = 'GDP per capita ($USD)',
    yAxisLabel = 'Metric Value',
    title = '',
    width = 800,
    height = 500,
}) => {
    // State
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('alphabetical');
    const [xDomain, setXDomain] = useState(null);
    const [paneWidth, setPaneWidth] = useState(200);
    const [isResizing, setIsResizing] = useState(false);
    const [metadata, setMetadata] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [selectedModelTypes, setSelectedModelTypes] = useState([]);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    
    // Constants
    const MIN_PANE_WIDTH = 150;
    const MAX_PANE_WIDTH = 400;
    const GAP = 16;
    const MOBILE_BREAKPOINT = 768;
    const MARGIN = { top: 105, right: 30, bottom: 80, left: 110 };
    const containerRef = useRef(null);
    
    // Responsive layout
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const effectivePaneWidth = isMobileLayout ? 0 : paneWidth;
    const effectiveGap = isMobileLayout ? 0 : GAP;
    const chartWidth = width - effectivePaneWidth - effectiveGap;
    const chartHeight = isMobileLayout ? height - 250 : height;
    
    // Font sizes based on width
    const titleFontSize = Math.max(14, width * 0.02);
    const axisLabelFontSize = Math.max(10, width * 0.015);
    const tickFontSize = Math.max(8, width * 0.013);
    const itemFontSize = Math.max(11, width * 0.011);
    const boundsWidth = chartWidth - MARGIN.left - MARGIN.right;
    const boundsHeight = chartHeight - MARGIN.top - MARGIN.bottom;
    
    // Ref to track resizing state for event handlers (avoids closure issues)
    const isResizingRef = useRef(false);
    
    // Handle pane resize
    const handleResize = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current || isMobileLayout) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        // Calculate new pane width: container width - (mouse X from container left)
        const newWidth = rect.width - (clientX - rect.left);
        
        // Constrain within bounds
        const constrainedWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, newWidth));
        setPaneWidth(constrainedWidth);
    }, [isMobileLayout]);
    
    const handleResizeEnd = useCallback(() => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
    }, []);
    
    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        setIsResizing(true);
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', handleResizeEnd);
        document.addEventListener('touchmove', handleResize);
        document.addEventListener('touchend', handleResizeEnd);
    }, [handleResize, handleResizeEnd]);
    
    // Cleanup event listeners on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', handleResizeEnd);
            document.removeEventListener('touchmove', handleResize);
            document.removeEventListener('touchend', handleResizeEnd);
            document.body.style.cursor = '';
        };
    }, [handleResize, handleResizeEnd]);
    
    // Load metadata on mount
    useEffect(() => {
        loadMetadata().then(setMetadata);
    }, []);
    
    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            const categoryDropdown = document.querySelector('.category-dropdown');
            const modelDropdown = document.querySelector('.model-dropdown');
            if (categoryDropdown && showCategoryDropdown && !categoryDropdown.contains(e.target)) {
                setShowCategoryDropdown(false);
            }
            if (modelDropdown && showModelDropdown && !modelDropdown.contains(e.target)) {
                setShowModelDropdown(false);
            }
        };
        if (showCategoryDropdown || showModelDropdown) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showCategoryDropdown, showModelDropdown]);
    
    // Create mapping from metric name to category and unit from metadata
    const metricToCategory = useMemo(() => {
        const map = {};
        metadata.forEach(m => {
            map[m.full_name] = m.category;
        });
        return map;
    }, [metadata]);

    const metricToUnit = useMemo(() => {
        const map = {};
        metadata.forEach(m => {
            map[m.full_name] = m.unit;
        });
        return map;
    }, [metadata]);

    // Get unit for y-axis label based on selected metric
    const effectiveYAxisLabel = useMemo(() => {
        if (selectedMetric && metricToUnit[selectedMetric]) {
            return metricToUnit[selectedMetric];
        }
        return yAxisLabel;
    }, [selectedMetric, metricToUnit, yAxisLabel]);
    
    // Get all unique categories from metadata
    const allCategories = useMemo(() => {
        const categories = metadata.map(m => m.category);
        return [...new Set(categories)].filter(c => c); // Filter out empty/null categories
    }, [metadata]);
    
    // Initialize selected categories to all on first load
    const initializedRef = useRef(false);
    useEffect(() => {
        if (allCategories.length > 0 && !initializedRef.current) {
            setSelectedCategories(allCategories);
            initializedRef.current = true;
        }
    }, [allCategories]);
    
    // Text for category filter button
    const categoryButtonText = useMemo(() => {
        if (selectedCategories.length === 0) return "None";
        if (selectedCategories.length === allCategories.length) return "Filter by category";
        return selectedCategories.join(", ");
    }, [selectedCategories, allCategories]);
    
    // Model type options and their corresponding best_model values
    const MODEL_TYPES = useMemo(() => ({
        'Constant': ['constant'],
        'Linear': ['linear'],
        'Saturating': ['michaelis_menten', 'exp_saturating', 'logarithmic'],
        'Undefined': ['other']
    }), []);
    
    const allModelTypes = useMemo(() => Object.keys(MODEL_TYPES), []);

    // Get count of metrics for each model type display name
    const modelTypeCounts = useMemo(() => {
        const modelValueCounts = {};
        regressionResults.forEach(r => {
            const model = r.best_model;
            modelValueCounts[model] = (modelValueCounts[model] || 0) + 1;
        });
        const counts = {};
        Object.entries(MODEL_TYPES).forEach(([displayName, modelValues]) => {
            counts[displayName] = modelValues.reduce((sum, val) => sum + (modelValueCounts[val] || 0), 0);
        });
        return counts;
    }, [regressionResults, MODEL_TYPES]);

    // Initialize selected model types to all on first load
    const modelInitializedRef = useRef(false);
    useEffect(() => {
        if (allModelTypes.length > 0 && !modelInitializedRef.current) {
            setSelectedModelTypes(allModelTypes);
            modelInitializedRef.current = true;
        }
    }, [allModelTypes]);
    
    // Text for model filter button
    const modelButtonText = useMemo(() => {
        if (selectedModelTypes.length === 0) return "None";
        if (selectedModelTypes.length === allModelTypes.length) return "Filter by model type";
        return selectedModelTypes.map(mt => `${mt} (${modelTypeCounts[mt] || 0})`).join(", ");
    }, [selectedModelTypes, allModelTypes, modelTypeCounts]);
    
    // Get regression result for selected metric
    const regressionForMetric = useMemo(() => {
        if (!selectedMetric || !regressionResults) return null;
        return regressionResults.find(r => r.metric_name === selectedMetric);
    }, [selectedMetric, regressionResults]);
    
    // Get GDP range from data
    const gdpRange = useMemo(() => {
        if (data.length === 0) return [0, 100];
        const allX = data.map(d => d.x).filter(x => x !== null && x !== undefined);
        if (allX.length === 0) return [0, 100];
        const [minX, maxX] = d3.extent(allX);
        return [minX || 0, maxX || 100];
    }, [data]);
    
    // Initialize xDomain
    useEffect(() => {
        if (xDomain === null && gdpRange[0] !== 0 && gdpRange[1] !== 0) {
            setXDomain(gdpRange);
        }
    }, [gdpRange, xDomain]);
    
    // Update xDomain when metric changes
    useEffect(() => {
        if (!selectedMetric) {
            setXDomain(gdpRange);
        } else if (regressionForMetric && regressionForMetric.n_observations > 0) {
            // Use the data's GDP range for this metric
            const metricX = data
                .filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined && d.x !== null && d.x !== undefined)
                .map(d => d.x);
            if (metricX.length > 0) {
                const [minX, maxX] = d3.extent(metricX);
                setXDomain([minX || gdpRange[0], maxX || gdpRange[1]]);
            }
        }
    }, [selectedMetric, data, gdpRange, regressionForMetric]);
    
    // Effective xDomain (controlled by slider)
    const effectiveXDomain = xDomain || gdpRange;
    
    // Filter data based on x-domain
    const filteredData = useMemo(() => {
        return data.filter(d => d.x >= effectiveXDomain[0] && d.x <= effectiveXDomain[1]);
    }, [data, effectiveXDomain]);
    
    // Get scatter points for selected metric
    const scatterData = useMemo(() => {
        if (!selectedMetric) return [];
        return filteredData.map(d => ({
            x: d.x,
            y: d[selectedMetric],
            year: d.year
        })).filter(d => d.y !== null && d.y !== undefined && d.x !== null && d.x !== undefined);
    }, [selectedMetric, filteredData]);
    
    // Calculate y-domain
    const yDomain = useMemo(() => {
        if (scatterData.length === 0) return [0, 1];
        const [minY, maxY] = d3.extent(scatterData, d => d.y);
        const padding = (maxY - minY) * 0.1;
        return [
            minY !== undefined ? minY - padding : 0,
            maxY !== undefined ? maxY + padding : 1
        ];
    }, [scatterData]);
    
    // Generate regression curve points
    const regressionPoints = useMemo(() => {
        if (!selectedMetric || !regressionForMetric) return [];
        return generateRegressionPoints(
            regressionForMetric.best_model,
            regressionForMetric,
            effectiveXDomain,
            100
        );
    }, [selectedMetric, regressionForMetric, effectiveXDomain]);
    
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
    
    // Handle metric selection
    const handleSelectMetric = useCallback((metric) => {
        setSelectedMetric(prev => prev === metric ? null : metric);
    }, []);
    
    const clearSelection = useCallback(() => {
        setSelectedMetric(null);
    }, []);
    
    // Get best model for each metric
    const metricToModel = useMemo(() => {
        const map = {};
        regressionResults.forEach(r => {
            map[r.metric_name] = r.best_model;
        });
        return map;
    }, [regressionResults]);
    
    // Check if a metric's model matches selected model types
    const matchesModelFilter = useCallback((metricName) => {
        const model = metricToModel[metricName];
        if (!model) return false;
        // Check if this metric's model is in any of the selected model type groups
        return selectedModelTypes.some(modelType => {
            const models = MODEL_TYPES[modelType];
            return models && models.includes(model);
        });
    }, [selectedModelTypes, metricToModel, MODEL_TYPES]);
    
    // Filter and sort metric list
    const filteredSeriesKeys = useMemo(() => {
        let result = seriesKeys.filter(key => {
            const matchesSearch = key.toLowerCase().includes(searchQuery.toLowerCase());
            const category = metricToCategory[key];
            const matchesCategory = category && selectedCategories.includes(category);
            const matchesModel = matchesModelFilter(key);
            return matchesSearch && matchesCategory && matchesModel;
        });
        
        if (sortBy === 'n_observations') {
            result.sort((a, b) => {
                const obsA = regressionResults.find(r => r.metric_name === a)?.n_observations || 0;
                const obsB = regressionResults.find(r => r.metric_name === b)?.n_observations || 0;
                return obsB - obsA;
            });
        } else {
            // alphabetical / name
            result.sort((a, b) => a.localeCompare(b));
        }
        
        return result;
    }, [seriesKeys, searchQuery, sortBy, regressionResults, selectedCategories, selectedModelTypes, matchesModelFilter]);
    

    
    // Format functions
    const formatGDP = (value) => {
        if (value === null || value === undefined) return 'N/A';
        if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return `${value.toFixed(2)}`;
    };
    
    const formatValue = (value) => {
        if (value === null || value === undefined) return 'N/A';
        if (Math.abs(value) >= 1000000) return value.toFixed(0);
        if (Math.abs(value) >= 1000) return value.toFixed(1);
        if (Math.abs(value) >= 1) return value.toFixed(2);
        if (Math.abs(value) >= 0.01) return value.toFixed(3);
        return value.toFixed(4);
    };
    
    const getDisplayName = (name) => name.replace(/_/g, ' ');
    
    return (
        <div ref={containerRef} className="flex flex-col md:flex-row gap-4 relative" style={{ width, height, fontFamily: FONT_FAMILY }}>
            {/* Main Chart Area */}
            <div className="flex-1 min-w-0" style={{ height: isMobileLayout ? chartHeight + 250 : chartHeight + 60 }}>
                <svg 
                    width={chartWidth} 
                    height={chartHeight}
                >
                    {/* Title */}
                    {title && (
                        <text
                            x={chartWidth / 2}
                            y={MARGIN.top - 70}
                            fontSize={titleFontSize}
                            textAnchor="middle"
                            fill="#333"
                            fontWeight="bold"
                            fontFamily={FONT_FAMILY}
                        >
                            {selectedMetric ? (
                                () => {
                                    const name = formatMetricName(selectedMetric);
                                    // Only split if name is long (>40 chars)
                                    if (name.length > 80) {
                                        const words = name.split(' ');
                                        const mid = Math.ceil(words.length / 2);
                                        return (
                                            <>
                                                <tspan x={chartWidth / 2} dy={0}>{words.slice(0, mid).join(' ')}</tspan>
                                                <tspan x={chartWidth / 2} dy={titleFontSize + 4}>{words.slice(mid).join(' ')}</tspan>
                                            </>
                                        );
                                    }
                                    return name;
                                }
                            )() : title}
                            {regressionForMetric && selectedMetric && (
                                <tspan x={chartWidth / 2} dy={30} fontSize={titleFontSize * 0.8} fill="#666">
                                    Best fit: {regressionForMetric.best_model === 'other' ? 'undefined' : regressionForMetric.best_model}
                                    {regressionForMetric.best_model !== 'other' && getR2Value(regressionForMetric) && ` (R² = ${getR2Value(regressionForMetric).toFixed(3)})`}
                                </tspan>
                            )}
                            {regressionForMetric === null && selectedMetric && (
                                <tspan x={chartWidth / 2} dy={16} fontSize={titleFontSize * 0.8} fill="#999">
                                    No regression data available
                                </tspan>
                            )}
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
                        
                        {/* Regression line */}
                        {regressionPoints.length > 0 && regressionForMetric && regressionForMetric.best_model !== 'other' && (
                            <path
                                d={d3.line()
                                    .x(d => xScale(d.x))
                                    .y(d => yScale(d.y))(regressionPoints)}
                                fill="none"
                                stroke="#8627ce"
                                strokeWidth={3}
                                strokeDasharray="5,5"
                            />
                        )}
                        
                        {/* Scatter points */}
                        {scatterData.map((point, i) => (
                            <circle
                                key={i}
                                cx={xScale(point.x)}
                                cy={yScale(point.y)}
                                r={6}
                                fill={"black"}
                                fillOpacity={0.7}
                                stroke="white"
                                strokeWidth={1.5}
                            />
                        ))}
                        
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
                            label={effectiveYAxisLabel}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                            tickFormat={formatValue}
                        />
                    </g>
                </svg>
                
                {/* Slider - GDP range */}
                <div className="mt-4 px-2 flex items-center gap-4">
                    <Slider
                        value={effectiveXDomain}
                        min={gdpRange[0]}
                        max={gdpRange[1]}
                        onChange={setXDomain}
                        label="GDP per capita range"
                    />
                    <button
                        onClick={() => {
                            if (selectedMetric) {
                                const metricData = data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                                const metricX = metricData.map(d => d.x).filter(x => x != null);
                                if (metricX.length > 0) {
                                    setXDomain(d3.extent(metricX));
                                    return;
                                }
                                setXDomain(gdpRange);  // ← Now inside the if(selectedMetric) block
                            } else {
                                setXDomain(gdpRange);
                            }
                        }}
                        className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors whitespace-nowrap"
                        style={{ fontFamily: FONT_FAMILY }}
                    >
                        Reset range
                    </button>
                </div>
            </div>
            
            {/* Resizer handle (hidden on mobile) */}
            {!isMobileLayout && (
                <div
                    className={`w-1 bg-gray-300 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors -mr-4`}
                    onMouseDown={handleResizeStart}
                    onTouchStart={handleResizeStart}
                    style={{ height: chartHeight, marginTop: -4 }}
                />
            )}
            
            {/* Side Pane */}
            <div 
                className={`bg-white border-l border-gray-200 p-4 rounded-lg shadow-sm overflow-y-auto ${isMobileLayout ? 'w-full order-first' : 'shrink-0'}`}
                style={{ width: isMobileLayout ? '100%' : `${paneWidth}px` }}
            >
                {/* Search Bar */}
                <div className="mb-4">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search for a metric"
                        style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                    />
                </div>
                
                {/* Model type filter dropdown */}
                <div className="mb-4 relative model-dropdown">
                    <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex justify-between items-center"
                        style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                    >
                        <span className="break-words text-left">{modelButtonText}</span>
                        <span className="text-gray-400">▼</span>
                    </button>
                    {showModelDropdown && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto" style={{ fontFamily: FONT_FAMILY }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedModelTypes.length === allModelTypes.length) {
                                        setSelectedModelTypes([]);
                                    } else {
                                        setSelectedModelTypes([...allModelTypes]);
                                    }
                                }}
                                className="w-full text-left px-3 py-1 hover:bg-gray-50 cursor-pointer sticky top-0 bg-white border-b border-gray-200 flex items-center"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedModelTypes.length === allModelTypes.length && allModelTypes.length > 0}
                                    readOnly
                                    className="mr-2 h-4 w-4 pointer-events-none"
                                />
                                <span className="text-sm font-semibold">Select All</span>
                            </button>
                            {allModelTypes.map(modelType => (
                                <label key={modelType} className="flex items-center px-3 py-1 hover:bg-gray-50 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedModelTypes.includes(modelType)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            if (e.target.checked) {
                                                setSelectedModelTypes([...selectedModelTypes, modelType]);
                                            } else {
                                                setSelectedModelTypes(selectedModelTypes.filter(m => m !== modelType));
                                            }
                                        }}
                                        className="mr-2 h-4 w-4"
                                    />
                                    <span className="text-sm">{modelType} ({modelTypeCounts[modelType] || 0})</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Category Filter Dropdown */}
                <div className="mb-4 relative category-dropdown">
                    <button
                        onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex justify-between items-center"
                        style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                    >
                        <span className="break-words text-left">{categoryButtonText}</span>
                        <span className="text-gray-400">▼</span>
                    </button>
                    {showCategoryDropdown && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto" style={{ fontFamily: FONT_FAMILY }}>
                            {/* Select All / Unselect All */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Toggle: if all selected, unselect all; otherwise select all
                                    if (selectedCategories.length === allCategories.length && allCategories.length > 0) {
                                        setSelectedCategories([]);
                                    } else {
                                        setSelectedCategories([...allCategories]);
                                    }
                                }}
                                className="w-full text-left px-3 py-1 hover:bg-gray-50 cursor-pointer sticky top-0 bg-white border-b border-gray-200 flex items-center"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.length === allCategories.length && allCategories.length > 0}
                                    readOnly
                                    className="mr-2 h-4 w-4 pointer-events-none"
                                />
                                <span className="text-sm font-semibold">Select All</span>
                            </button>
                            {allCategories.map(cat => (
                                <label key={cat} className="flex items-center px-3 py-1 hover:bg-gray-50 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedCategories.includes(cat)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            if (e.target.checked) {
                                                setSelectedCategories([...selectedCategories, cat]);
                                            } else {
                                                setSelectedCategories(selectedCategories.filter(c => c !== cat));
                                            }
                                        }}
                                        className="mr-2 h-4 w-4"
                                    />
                                    <span className="text-sm">{cat}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Sort Dropdown */}
                <div className="mb-4">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                    >
                        <option value="n_observations">Sort by: # of datapoints (high to low)</option>
                        <option value="alphabetical">Sort by: Name (A-Z)</option>
                    </select>
                </div>
                
                {/* Selection Info */}
                <div className="mb-4 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700" style={{ fontSize: itemFontSize }}>
                        {selectedMetric ? formatMetricName(selectedMetric) : 'No metric selected'}
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
                
                {/* Metric List */}
                <div className="space-y-1">
                    {filteredSeriesKeys.map((key) => {
                        const isSelected = selectedMetric === key;
                        const regResult = regressionResults.find(r => r.metric_name === key);
                        
                        // Get database name for color (WISE, SPI2025, etc.)
                        const metricMetadata = metadata.find(m => m.full_name === key);
                        const dbName = metricMetadata?.database_name || getCategoryFromName(key);
                        const color = CATEGORY_COLORS[dbName] || COLORS[0];
                        
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
                                    className="flex-1 text-sm break-words"
                                    style={{
                                        fontSize: itemFontSize,
                                        fontWeight: isSelected ? 'bold' : 'normal'
                                    }}
                                >
                                    {formatMetricName(key)}
                                </span>
                                
                                {/* Model indicator */}
                                {regResult && (
                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                        {regResult.best_model === 'linear' ? 'Lin' : 
                                         regResult.best_model === 'logarithmic' ? 'Log' :
                                         regResult.best_model === 'michaelis_menten' ? 'MM' :
                                         regResult.best_model === 'exp_saturating' ? 'Sat' :
                                         regResult.best_model === 'constant' ? 'Cst' :
                                         '?'}
                                    </span>
                                )}
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
 * Responsive wrapper
 */
export const ResponsiveScatterplotWithRegression = ({ width = 800, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    
    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;
    
    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <ScatterplotWithRegression
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};

export default ScatterplotWithRegression;
