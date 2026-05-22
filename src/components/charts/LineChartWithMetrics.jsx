/*
 * Line Chart with Metrics
 * Displays metric values over years as a line chart
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import { Delaunay } from 'd3-delaunay';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
import { Slider } from '../ui/Slider';
import { SearchBar } from '../ui/SearchBar';
import { Tooltip } from '../ui/Tooltip';
import { useDimensions } from '../../../hooks/use-dimensions';

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
    if (metricName.startsWith('OFS_')) return 'OFS';
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
 * Line Chart with Metrics
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of data points: [{ x: gdp, metric1: value, year: year }, ...]
 * @param {Array} props.seriesKeys - Array of series names
 * @param {Array} props.regressionResults - Regression results with parameters
 * @param {Array} props.metadata - Metadata for metrics
 * @param {string} [props.selectedMetric] - Currently selected metric (controlled)
 * @param {Function} [props.onSelectMetric] - Callback when metric is selected
 * @param {string} [props.searchQuery] - Current search query (controlled)
 * @param {Function} [props.onSearchChange] - Callback when search changes
 * @param {string} [props.sortBy] - Current sort option (controlled)
 * @param {Function} [props.onSortChange] - Callback when sort changes
 * @param {Array} [props.selectedCategories] - Currently selected categories (controlled)
 * @param {Function} [props.onCategoriesChange] - Callback when categories change
 * @param {Array} [props.selectedModelTypes] - Currently selected model types (controlled)
 * @param {Function} [props.onModelTypesChange] - Callback when model types change
 * @param {string} [props.selectedPredictorType='CHF_LCU'] - Currently selected predictor type
 * @param {Function} [props.onPredictorChange] - Callback when predictor type changes
 * @param {number} [props.paneWidth] - Current pane width (controlled)
 * @param {Function} [props.onPaneWidthChange] - Callback when pane width changes
 * @param {string} [props.xAxisLabel='Year'] - Label for x-axis
 * @param {string} [props.yAxisLabel='Metric Value'] - Label for y-axis
 * @param {string} [props.title=''] - Chart title
 */
export const LineChartWithMetrics = ({
    data,
    seriesKeys,
    regressionResults,
    metadata: externalMetadata,
    selectedMetric: externalSelectedMetric,
    onSelectMetric: externalOnSelectMetric,
    searchQuery: externalSearchQuery,
    onSearchChange: externalOnSearchChange,
    sortBy: externalSortBy,
    onSortChange: externalOnSortChange,
    selectedCategories: externalSelectedCategories,
    onCategoriesChange: externalOnCategoriesChange,
    selectedModelTypes: externalSelectedModelTypes,
    onModelTypesChange: externalOnModelTypesChange,
    selectedPredictorType: externalSelectedPredictorType,
    onPredictorChange: externalOnPredictorChange,
    paneWidth: externalPaneWidth,
    onPaneWidthChange: externalOnPaneWidthChange,
    xAxisLabel = 'Year',
    yAxisLabel = 'Metric Value',
    title = '',
    width = 800,
    height = 500,
}) => {
    // Use external props if provided, otherwise fall back to internal state
    const metadata = externalMetadata !== undefined ? externalMetadata : [];
    const [internalSelectedMetric, setInternalSelectedMetric] = useState(null);
    const selectedMetric = externalSelectedMetric !== undefined ? externalSelectedMetric : internalSelectedMetric;
    const setSelectedMetric = externalOnSelectMetric !== undefined ? externalOnSelectMetric : setInternalSelectedMetric;
    const [internalSearchQuery, setInternalSearchQuery] = useState('');
    const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
    const setSearchQuery = externalOnSearchChange !== undefined ? externalOnSearchChange : setInternalSearchQuery;
    const [internalSortBy, setInternalSortBy] = useState('alphabetical');
    const sortBy = externalSortBy !== undefined ? externalSortBy : internalSortBy;
    const setSortBy = externalOnSortChange !== undefined ? externalOnSortChange : setInternalSortBy;
    const [internalSelectedCategories, setInternalSelectedCategories] = useState([]);
    const selectedCategories = externalSelectedCategories !== undefined ? externalSelectedCategories : internalSelectedCategories;
    const setSelectedCategories = externalOnCategoriesChange !== undefined ? externalOnCategoriesChange : setInternalSelectedCategories;
    const [internalSelectedModelTypes, setInternalSelectedModelTypes] = useState([]);
    const selectedModelTypes = externalSelectedModelTypes !== undefined ? externalSelectedModelTypes : internalSelectedModelTypes;
    const setSelectedModelTypes = externalOnModelTypesChange !== undefined ? externalOnModelTypesChange : setInternalSelectedModelTypes;
    const [internalSelectedPredictorType, setInternalSelectedPredictorType] = useState('CHF_LCU');
    const selectedPredictorType = externalSelectedPredictorType !== undefined ? externalSelectedPredictorType : internalSelectedPredictorType;
    const setSelectedPredictorType = externalOnPredictorChange !== undefined ? externalOnPredictorChange : setInternalSelectedPredictorType;
    const [internalPaneWidth, setInternalPaneWidth] = useState(200);
    const paneWidth = externalPaneWidth !== undefined ? externalPaneWidth : internalPaneWidth;
    const setPaneWidth = externalOnPaneWidthChange !== undefined ? externalOnPaneWidthChange : setInternalPaneWidth;
    
    // Local state (not shared)
    const [yearDomain, setYearDomain] = useState(null);
    const [isResizing, setIsResizing] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    
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



    // Text for category filter button
    const categoryButtonText = useMemo(() => {
        if (selectedCategories.length === 0) return "None";
        if (selectedCategories.length === allCategories.length) return "Filter by category";
        return selectedCategories.join(", ");
    }, [selectedCategories, allCategories]);

    // All model type display categories with direction (using arrows)
    const ALL_MODEL_TYPES = useMemo(() => [
        'Constant', 'Undefined',
        '↑ Linear', '↓ Linear',
        '↑ Saturating', '↓ Saturating'
    ], []);

    // Get display category from regression result based on model type and direction
    const getModelDisplayCategory = useCallback((regResult) => {
        if (!regResult) return 'Undefined';
        
        const model = regResult.best_model;
        if (model === 'constant') return 'Constant';
        if (model === 'other') return 'Undefined';
        
        if (model === 'linear') {
            return regResult.lin_slope >= 0 ? '↑ Linear' : '↓ Linear';
        }
        
        if (model === 'michaelis_menten') {
            return regResult.mm_vmax >= 0 ? '↑ Saturating' : '↓ Saturating';
        }
        
        if (model === 'exp_saturating') {
            return regResult.sat_c >= 0 ? '↑ Saturating' : '↓ Saturating';
        }
        
        if (model === 'logarithmic') {
            return regResult.log_b >= 0 ? '↑ Saturating' : '↓ Saturating';
        }
        
        return 'Undefined';
    }, []);

    const allModelTypes = ALL_MODEL_TYPES;

    // Get display category for each metric (for current predictor only)
    const metricToDisplayCategory = useMemo(() => {
        const map = {};
        // First pass: get categories for current predictor
        regressionResults.forEach(r => {
            if (r.predictor_type !== selectedPredictorType) return;
            map[r.target_metric] = getModelDisplayCategory(r);
        });
        // Second pass: mark metrics with no results for current predictor as 'Undefined'
        seriesKeys.forEach(key => {
            if (!(key in map)) {
                map[key] = 'Undefined';
            }
        });
        return map;
    }, [regressionResults, getModelDisplayCategory, selectedPredictorType, seriesKeys]);

    // Get count of metrics for each model type display category
    const modelTypeCounts = useMemo(() => {
        const counts = {};
        ALL_MODEL_TYPES.forEach(cat => counts[cat] = 0);
        regressionResults.forEach(r => {
            if (r.predictor_type !== selectedPredictorType) return;
            const category = getModelDisplayCategory(r);
            counts[category] = (counts[category] || 0) + 1;
        });
        // Count metrics with no results as 'Undefined'
        const metricsWithResults = new Set(regressionResults
            .filter(r => r.predictor_type === selectedPredictorType)
            .map(r => r.target_metric));
        const undefinedCount = seriesKeys.filter(k => !metricsWithResults.has(k)).length;
        counts['Undefined'] = (counts['Undefined'] || 0) + undefinedCount;
        return counts;
    }, [regressionResults, getModelDisplayCategory, ALL_MODEL_TYPES, selectedPredictorType, seriesKeys]);

    // Text for model filter button
    const modelButtonText = useMemo(() => {
        if (selectedModelTypes.length === 0) return "None";
        if (selectedModelTypes.length === allModelTypes.length) return "Filter by model type";
        return selectedModelTypes.map(mt => `${mt} (${modelTypeCounts[mt] || 0})`).join(", ");
    }, [selectedModelTypes, allModelTypes, modelTypeCounts]);

    // Get regression result for selected metric and predictor type
    const regressionForMetric = useMemo(() => {
        if (!selectedMetric || !regressionResults) return null;
        return regressionResults.find(r => r.target_metric === selectedMetric && r.predictor_type === selectedPredictorType);
    }, [selectedMetric, regressionResults, selectedPredictorType]);

    // Get year range from data
    const yearRange = useMemo(() => {
        if (data.length === 0) return [1960, 2024];
        const allYears = data.map(d => d.year).filter(y => y !== null && y !== undefined);
        if (allYears.length === 0) return [1960, 2024];
        const [minYear, maxYear] = d3.extent(allYears);
        return [minYear || 1960, maxYear || 2024];
    }, [data]);

    // Get year range for a specific metric
    const getYearRangeForMetric = useCallback((metric) => {
        if (!metric || data.length === 0) return null;
        const years = data
            .map(d => d[metric] !== null && d[metric] !== undefined ? d.year : null)
            .filter(y => y !== null && y !== undefined);
        if (years.length === 0) return null;
        const [minYear, maxYear] = d3.extent(years);
        return minYear && maxYear ? `${minYear}-${maxYear}` : null;
    }, [data]);

    // Initialize yearDomain
    useEffect(() => {
        if (yearDomain === null && yearRange[0] !== 1960 && yearRange[1] !== 2024) {
            setYearDomain(yearRange);
        }
    }, [yearRange, yearDomain]);

    // Update yearDomain when metric changes
    useEffect(() => {
        if (!selectedMetric) {
            setYearDomain(yearRange);
        } else {
            // Use the data's year range for this metric
            const metricYears = data
                .filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined && d.year !== null && d.year !== undefined)
                .map(d => d.year);
            if (metricYears.length > 0) {
                const [minYear, maxYear] = d3.extent(metricYears);
                setYearDomain([minYear || yearRange[0], maxYear || yearRange[1]]);
            }
        }
    }, [selectedMetric, data, yearRange]);
    
    // Effective yearDomain (controlled by slider)
    const effectiveYearDomain = yearDomain || yearRange;
    
    // Filter data based on year-domain
    const filteredData = useMemo(() => {
        return data.filter(d => d.year >= effectiveYearDomain[0] && d.year <= effectiveYearDomain[1]);
    }, [data, effectiveYearDomain]);

    // Get line chart data for selected metric
    const lineData = useMemo(() => {
        if (!selectedMetric) return [];
        return filteredData.map(d => ({
            year: d.year,
            value: d[selectedMetric],
        })).filter(d => d.value !== null && d.value !== undefined && d.year !== null && d.year !== undefined);
    }, [selectedMetric, filteredData]);

    // Calculate x and y domains for the line chart
    const xDomain = useMemo(() => {
        if (lineData.length === 0) return [1960, 2024];
        const [minX, maxX] = d3.extent(lineData, d => d.year);
        return [minX || 1960, maxX || 2024];
    }, [lineData]);

    const yDomain = useMemo(() => {
        if (lineData.length === 0) return [0, 1];
        const [minY, maxY] = d3.extent(lineData, d => d.value);
        const padding = (maxY - minY) * 0.1;
        return [
            minY !== undefined ? minY - padding : 0,
            maxY !== undefined ? maxY + padding : 1
        ];
    }, [lineData]);

    // X and Y scales
    const xScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([effectiveYearDomain[0], effectiveYearDomain[1]])
            .range([0, boundsWidth]);
    }, [effectiveYearDomain, boundsWidth]);

    const yScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain(yDomain)
            .range([boundsHeight, 0]);
    }, [yDomain, boundsHeight]);

    // Create Voronoi diagram from line data points (in pixel coordinates within bounds)
    const voronoiDiagram = useMemo(() => {
        if (!xScale || !yScale || lineData.length === 0) return null;
        
        // Extract pixel coordinates for each point
        const points = lineData.map(d => [
            xScale(d.year),
            yScale(d.value)
        ]);
        
        return Delaunay.from(points);
    }, [lineData, xScale, yScale]);

    // Line generator
    const lineBuilder = useMemo(() => {
        return d3
            .line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.value))
            .defined(d => d.value !== null && d.value !== undefined);
    }, [xScale, yScale]);

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

    // Check if a metric's display category matches selected model types
    const matchesModelFilter = useCallback((metricName) => {
        if (selectedModelTypes.length === 0) return true;
        const displayCategory = metricToDisplayCategory[metricName];
        if (!displayCategory) return false;
        return selectedModelTypes.includes(displayCategory);
    }, [selectedModelTypes, metricToDisplayCategory]);

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
                const obsA = regressionResults.find(r => r.target_metric === a && r.predictor_type === selectedPredictorType)?.n_observations || 0;
                const obsB = regressionResults.find(r => r.target_metric === b && r.predictor_type === selectedPredictorType)?.n_observations || 0;
                return obsB - obsA;
            });
        } else {
            // alphabetical / name
            result.sort((a, b) => a.localeCompare(b));
        }
        
        return result;
    }, [seriesKeys, searchQuery, sortBy, regressionResults, selectedCategories, selectedModelTypes, matchesModelFilter, metricToCategory]);
    

    // Format functions
    const formatYear = (value) => {
        if (value === null || value === undefined) return 'N/A';
        return `${Math.round(value)}`;
    };
    
    const formatValue = (value) => {
        if (value === null || value === undefined) return 'N/A';
        if (Math.abs(value) >= 1000000) return value.toFixed(0);
        if (Math.abs(value) >= 1000) return value.toFixed(1);
        if (Math.abs(value) >= 1) return value.toFixed(2);
        if (Math.abs(value) >= 0.01) return value.toFixed(3);
        return value.toFixed(4);
    };

    return (
        <div ref={containerRef} className="flex flex-col md:flex-row gap-4 relative" style={{ width, height, fontFamily: FONT_FAMILY }}>
            {/* Main Chart Area */}
            <div className="flex-1 min-w-0" style={{ height: isMobileLayout ? chartHeight + 250 : chartHeight + 60 }}>
                <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
                    <svg 
                        width={chartWidth} 
                        height={chartHeight}
                        onMouseMove={(e) => {
                            if (!voronoiDiagram || lineData.length === 0) {
                                setHoveredIndex(null);
                                setHoveredPoint(null);
                                return;
                            }
                            
                            const svgRect = e.currentTarget.getBoundingClientRect();
                            // Get mouse position relative to the g element (which is at MARGIN.left, MARGIN.top within SVG)
                            const mouseX = e.clientX - svgRect.left - MARGIN.left;
                            const mouseY = e.clientY - svgRect.top - MARGIN.top;
                            
                            // Clamp to bounds to avoid errors
                            if (mouseX < 0 || mouseX > boundsWidth || mouseY < 0 || mouseY > boundsHeight) {
                                setHoveredIndex(null);
                                setHoveredPoint(null);
                                return;
                            }
                            
                            // Find closest point using Voronoi
                            const closestIndex = voronoiDiagram.find(mouseX, mouseY);
                            
                            if (closestIndex !== null && closestIndex >= 0 && closestIndex < lineData.length) {
                                const point = lineData[closestIndex];
                                setHoveredIndex(closestIndex);
                                setHoveredPoint({
                                    xPos: MARGIN.left + xScale(point.year) - 120,
                                    yPos: MARGIN.top + yScale(point.value) - 20,
                                    year: point.year,
                                    metricValue: `Metric value: ${formatValue(point.value)}`
                                });
                            } else {
                                setHoveredIndex(null);
                                setHoveredPoint(null);
                            }
                        }}
                        onMouseLeave={() => {
                            setHoveredIndex(null);
                            setHoveredPoint(null);
                        }}
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
                                    const yearRange = getYearRangeForMetric(selectedMetric);
                                    const displayName = yearRange ? `${name} - ${yearRange}` : name;
                                    // Only split if name is long (>40 chars)
                                    if (displayName.length > 80) {
                                        const words = displayName.split(' ');
                                        const mid = Math.ceil(words.length / 2);
                                        return (
                                            <>
                                                <tspan x={chartWidth / 2} dy={0}>{words.slice(0, mid).join(' ')}</tspan>
                                                <tspan x={chartWidth / 2} dy={titleFontSize + 4}>{words.slice(mid).join(' ')}</tspan>
                                            </>
                                        );
                                    }
                                    return displayName;
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
                        
                        {/* Line chart */}
                        {lineData.length > 0 && (
                            <path
                                d={lineBuilder(lineData)}
                                fill="none"
                                stroke={metricColor}
                                strokeWidth={3}
                            />
                        )}
                        
                        {/* Vertical hover line */}
                        {hoveredIndex !== null && lineData[hoveredIndex] && (
                            <line
                                x1={xScale(lineData[hoveredIndex].year)}
                                y1={0}
                                x2={xScale(lineData[hoveredIndex].year)}
                                y2={boundsHeight}
                                stroke="#999"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                            />
                        )}
                        
                        {/* Data points on line */}
                        {lineData.map((point, i) => {
                            const isHovered = hoveredIndex === i;
                            return (
                                <circle
                                    key={i}
                                    cx={xScale(point.year)}
                                    cy={yScale(point.value)}
                                    r={6}
                                    fill={"black"}
                                    fillOpacity={isHovered ? 1 : 0.7}
                                    stroke="white"
                                    strokeWidth={1.5}
                                />
                            );
                        })}
                        
                        {/* Axes */}
                        <AxisBottom 
                            xScale={xScale} 
                            pixelsPerTick={100} 
                            boundsHeight={boundsHeight} 
                            label={xAxisLabel}
                            showVerticalGrid={false}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                            tickFormat={formatYear}
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
                    
                    {/* Tooltip */}
                    <Tooltip interactionData={hoveredPoint} />
                </div>

                {/* Slider - Year range */}
                <div className="mt-4 px-2 flex items-center gap-4">
                    <Slider
                        value={effectiveYearDomain}
                        min={yearRange[0]}
                        max={yearRange[1]}
                        onChange={setYearDomain}
                        label="Year range"
                        unit=""
                    />
                    <button
                        onClick={() => {
                            if (selectedMetric) {
                                const metricData = data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                                const metricYears = metricData.map(d => d.year).filter(y => y != null);
                                if (metricYears.length > 0) {
                                    setYearDomain(d3.extent(metricYears));
                                    return;
                                }
                            }
                            setYearDomain(yearRange);
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
                
                {/* Predictor type selector */}
                <div className="mb-4">
                    <select
                        value={selectedPredictorType}
                        onChange={(e) => setSelectedPredictorType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                    >
                        <option value="CHF_LCU">GDP : CHF (constant)</option>
                        <option value="current_USD">GDP : USD (current)</option>
                    </select>
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
                        const regResult = regressionResults.find(r => r.target_metric === key && r.predictor_type === selectedPredictorType);
                        
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
export const ResponsiveLineChartWithMetrics = ({ width = 800, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    
    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;
    
    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <LineChartWithMetrics
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};

export default LineChartWithMetrics;
