/*
 * Scatterplot with Regression Line
 * Displays data points (GDP vs metric) with best-fit regression curve
 * Supports: linear, logarithmic, Michaelis-Menten, universal saturation models.
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
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
 * Check if two rectangles intersect
 */
function rectsIntersect(a, b) {
    return !(
        a.x + a.width < b.x ||
        a.x > b.x + b.width ||
        a.y + a.height < b.y ||
        a.y > b.y + b.height
    );
}

/**
 * Format metric name with database suffix in parentheses
 * e.g., "WISE_Composite Measure of Wellbeing" → "Composite Measure of Wellbeing (WISE)"
 */
function formatMetricName(name) {
    // Special formatting for GDP metrics
    if (name === 'GDP_GDP_current_USD_WorldBank_per_capita') return 'GDP per capita in USD (current)';
    if (name === 'GDP_GDP_constant_LCU_WorldBank_per_capita') return 'GDP per capita in CHF (constant LCU)';
    
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
 * @param {Function} [props.onSwitchToLineChart] - Callback to switch to line chart (for GDP metrics)
 * @param {number[]} [props.xDomain] - Current x-domain (controlled)
 * @param {Function} [props.onXDomainChange] - Callback when x-domain changes
 * @param {number[]} [props.gdpRange] - GDP range for x-axis
 * @param {string} [props.xAxisLabel='GDP per capita ($USD)'] - Label for x-axis
 * @param {string} [props.yAxisLabel='Metric Value'] - Label for y-axis
 * @param {string} [props.title=''] - Chart title
 */
export const ScatterplotWithRegression = ({
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
    onSwitchToLineChart,
    xDomain: externalXDomain,
    onXDomainChange: externalOnXDomainChange,
    gdpRange: externalGdpRange,
    xAxisLabel = 'GDP per capita ($USD)',
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
    
    // xDomain and gdpRange state (controlled from App.jsx for scatter plot)
    const xDomain = externalXDomain !== undefined ? externalXDomain : null;
    const setXDomain = externalOnXDomainChange !== undefined ? externalOnXDomainChange : (() => {});
    const gdpRange = externalGdpRange !== undefined ? externalGdpRange : [0, 100];
    
    // Local state (not shared)
    const [isResizing, setIsResizing] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    
    // Refs
    const containerRef = useRef(null);
    const metricListRef = useRef(null);
    
    // Auto-scroll to selected metric
    useEffect(() => {
        if (selectedMetric && metricListRef.current) {
            const el = metricListRef.current.querySelector(`[data-metric-key="${selectedMetric}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedMetric]);
    
    // Constants
    const MIN_PANE_WIDTH = 150;
    const MAX_PANE_WIDTH = 400;
    const GAP = 16;
    const MOBILE_BREAKPOINT = 768;
    const MARGIN = { top: 105, right: 30, bottom: 80, left: 110 };
    
    // Responsive layout
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const effectivePaneWidth = isMobileLayout ? 0 : paneWidth;
    const effectiveGap = isMobileLayout ? 0 : GAP;
    // Enforce square chart area
    const availableWidth = width - effectivePaneWidth - effectiveGap;
    const chartHeight = availableWidth;
    const chartWidth = availableWidth;
    
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
        'Undefined', 'Constant',
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

    // Dynamic x-axis label based on selected predictor
    const effectiveXAxisLabel = selectedPredictorType === 'CHF_LCU' 
        ? 'GDP per capita (CHF, constant LCU)' 
        : 'GDP per capita (current $USD)';
    
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
            const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
            const metricX = data
                .filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined && d[gdpKey] !== null && d[gdpKey] !== undefined)
                .map(d => d[gdpKey]);
            if (metricX.length > 0) {
                const [minX, maxX] = d3.extent(metricX);
                setXDomain([minX || gdpRange[0], maxX || gdpRange[1]]);
            }
        }
    }, [selectedMetric, data, gdpRange, regressionForMetric, selectedPredictorType]);

    // Effective xDomain (controlled by slider from App.jsx)
    const effectiveXDomain = xDomain || gdpRange;
    
    // Filter data based on x-domain
    const filteredData = useMemo(() => {
        const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
        return data.filter(d => {
            const xVal = d[gdpKey];
            return xVal >= effectiveXDomain[0] && xVal <= effectiveXDomain[1];
        });
    }, [data, effectiveXDomain, selectedPredictorType]);
    
    // Get scatter points for selected metric
    const scatterData = useMemo(() => {
        if (!selectedMetric) return [];
        const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
        return filteredData.map(d => ({
            x: d[gdpKey],
            y: d[selectedMetric],
            year: d.year
        })).filter(d => d.y !== null && d.y !== undefined && d.x !== null && d.x !== undefined);
    }, [selectedMetric, filteredData, selectedPredictorType]);
    
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

    // Calculate y-domain (includes both data points and regression line)
    const yDomain = useMemo(() => {
        if (scatterData.length === 0) return [0, 1];
        const dataYValues = scatterData.map(d => d.y);
        const regressionYValues = regressionPoints.map(d => d.y);
        const allYValues = [...dataYValues, ...regressionYValues]
            .filter(y => y !== null && y !== undefined && !isNaN(y) && isFinite(y));
        if (allYValues.length === 0) return [0, 1];
        const [minY, maxY] = d3.extent(allYValues);
        const range = maxY - minY;
        // Check only data points (not regression line) for non-negativity
        const filteredDataYValues = dataYValues.filter(y => y !== null && y !== undefined && !isNaN(y) && isFinite(y));
        const allNonNegative = filteredDataYValues.every(y => y >= 0);
        
        // Handle constant/near-constant metrics with proportional range
        if (Math.abs(range) < 1e-10) {
            const center = (minY + maxY) / 2;
            const valueScale = Math.max(Math.abs(center), 1);
            let domainMin = center - valueScale * 0.1;
            let domainMax = center + valueScale * 0.1;
            if (allNonNegative) domainMin = Math.max(0, domainMin);
            return [domainMin, domainMax];
        }
        
        const padding = range * 0.1;
        const domainMin = minY !== undefined ? minY - padding : 0;
        const domainMax = maxY !== undefined ? maxY + padding : 1;
        // Clamp minimum to 0 if all data points are non-negative
        const finalMin = allNonNegative ? Math.max(0, domainMin) : domainMin;
        return [finalMin, domainMax];
    }, [scatterData, regressionPoints]);
    
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
        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
        if (gdpMetrics.includes(metric) && onSwitchToLineChart) {
            // Switch to line chart for GDP metrics
            onSwitchToLineChart();
            setSelectedMetric(metric);
        } else {
            setSelectedMetric(prev => prev === metric ? null : metric);
        }
    }, [onSwitchToLineChart]);
    
    const clearSelection = useCallback(() => {
        setSelectedMetric(null);
    }, []);
    
    // Check if a metric's display category matches selected model types
    const matchesModelFilter = useCallback((metricName) => {
        if (selectedModelTypes.length === 0) return false; // Nothing selected = filter out everything
        const displayCategory = metricToDisplayCategory[metricName];
        if (!displayCategory) return false;
        return selectedModelTypes.includes(displayCategory);
    }, [selectedModelTypes, metricToDisplayCategory]);
    
    // Filter and sort metric list
    const filteredSeriesKeys = useMemo(() => {
        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
        
        // Always include GDP metrics at top (unaffected by filters)
        const gdpInList = gdpMetrics.filter(key => seriesKeys.includes(key));
        
        // Regular metrics with all filters applied
        let regularMetrics = seriesKeys.filter(key => {
            const isGDP = gdpMetrics.includes(key);
            const matchesSearch = key.toLowerCase().includes(searchQuery.toLowerCase());
            const category = metricToCategory[key];
            const matchesCategory = category && selectedCategories.includes(category);
            const matchesModel = matchesModelFilter(key);
            return !isGDP && matchesSearch && matchesCategory && matchesModel;
        });
        
        // Sort both groups
        if (sortBy === 'n_observations') {
            const sortFn = (a, b) => {
                const obsA = regressionResults.find(r => r.target_metric === a && r.predictor_type === selectedPredictorType)?.n_observations || 0;
                const obsB = regressionResults.find(r => r.target_metric === b && r.predictor_type === selectedPredictorType)?.n_observations || 0;
                return obsB - obsA;
            };
            gdpInList.sort(sortFn);
            regularMetrics.sort(sortFn);
        } else if (sortBy === 'r2_desc' || sortBy === 'r2_asc') {
            const getR2 = (metric) => {
                const reg = regressionResults.find(r => r.target_metric === metric && r.predictor_type === selectedPredictorType);
                if (!reg) return -Infinity;
                return Math.max(
                    reg.r2_linear || 0,
                    reg.r2_log || 0,
                    reg.r2_mm || 0,
                    reg.r2_expsat || 0
                );
            };
            const sortFn = (a, b) => {
                const r2A = getR2(a);
                const r2B = getR2(b);
                return sortBy === 'r2_desc' ? r2B - r2A : r2A - r2B;
            };
            gdpInList.sort(sortFn);
            regularMetrics.sort(sortFn);
        } else {
            // alphabetical / name
            gdpInList.sort((a, b) => a.localeCompare(b));
            regularMetrics.sort((a, b) => a.localeCompare(b));
        }
        
        // Prepend GDP metrics to the list
        return [...gdpInList, ...regularMetrics];
    }, [seriesKeys, searchQuery, sortBy, regressionResults, selectedCategories, selectedModelTypes, matchesModelFilter]);
    

    
    // Format functions
    const formatGDP = (value) => {
        if (value === null || value === undefined) return 'N/A';
        const abs = Math.abs(value);
        if (abs >= 1000000000000) return `${(value / 1000000000000).toFixed(abs % 1000000000000 === 0 ? 0 : 1)}T`;
        if (abs >= 1000000000) return `${(value / 1000000000).toFixed(abs % 1000000000 === 0 ? 0 : 1)}B`;
        if (abs >= 1000000) return `${(value / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
        if (abs >= 1000) return `${(value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
        return `${value.toFixed(2)}`;
    };
    
    const formatValue = (value) => {
        if (value === null || value === undefined) return 'N/A';
        const abs = Math.abs(value);
        if (abs >= 1000000000000) return `${(value / 1000000000000).toFixed(abs % 1000000000000 === 0 ? 0 : 1)}T`;
        if (abs >= 1000000000) return `${(value / 1000000000).toFixed(abs % 1000000000 === 0 ? 0 : 1)}B`;
        if (abs >= 1000000) return `${(value / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
        if (abs >= 1000) return `${(value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
        if (abs >= 1) return value.toFixed(2);
        if (abs >= 0.01) return value.toFixed(3);
        return value.toFixed(4);
    };
    
    const getDisplayName = (name) => name.replace(/_/g, ' ');
    
    return (
        <div ref={containerRef} className="flex flex-col md:flex-row gap-4 relative" style={{ width, fontFamily: FONT_FAMILY }}>
            {/* Main Chart Area */}
            <div className="flex-1 min-w-0 relative" style={{ height: isMobileLayout ? chartHeight + 250 : chartHeight}} >
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
                                    Best fit: {regressionForMetric.best_model === 'other' ? `undefined (Best fit R² = ${getR2Value(regressionForMetric)?.toFixed(3)})` : regressionForMetric.best_model}
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
                    
                    {selectedMetric && scatterData.length === 0 && (() => {
                        const message = "No data matching with GDP year range";
                        const fontSize = titleFontSize * 2;

                        if (message.length > 30) {
                            const words = message.split(' ');
                            const mid = Math.ceil(words.length / 2);
                            return (
                                <text x={chartWidth / 2} y={chartHeight / 2} fontSize={fontSize} textAnchor="middle" fill="#999" fontFamily={FONT_FAMILY}>
                                    <tspan x={chartWidth / 2} dy={0}>{words.slice(0, mid).join(' ')}</tspan>
                                    <tspan x={chartWidth / 2} dy={fontSize * 1.2}>{words.slice(mid).join(' ')}</tspan>
                                </text>
                            );
                        }
                        return (
                            <text x={chartWidth / 2} y={chartHeight / 2} fontSize={fontSize} textAnchor="middle" fill="#999" fontFamily={FONT_FAMILY}>
                                {message}
                            </text>
                        );
                    })()}
                    
                    {/* Chart Group */}
                    <g
                        width={boundsWidth}
                        height={boundsHeight}
                        transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}
                    >
                        {/* Regression line */}
                        {regressionPoints.length > 0 && regressionForMetric && regressionForMetric.best_model !== 'other' && (
                            <path
                                d={d3.line()
                                    .x(d => xScale(d.x))
                                    .y(d => yScale(d.y))(regressionPoints.filter(d => d.y >= yDomain[0] && d.y <= yDomain[1]))}
                                fill="none"
                                stroke="#8627ce"
                                strokeWidth={3}
                                strokeDasharray="5,5"
                            />
                        )}
                        
                        {/* Scatter points */}
                        {scatterData.map((point, i) => {
                            const isHovered = hoveredIndex === i;
                            const opacity = hoveredIndex === null ? 0.7 : (isHovered ? 1 : 0.2);
                            return (
                                <circle
                                    key={i}
                                    cx={xScale(point.x)}
                                    cy={yScale(point.y)}
                                    r={6}
                                    fill={"black"}
                                    fillOpacity={opacity}
                                    stroke="white"
                                    strokeWidth={1.5}
                                    onMouseEnter={(e) => {
                                        const gdpLabel = selectedPredictorType === 'CHF_LCU' ? 'GDP (constant CHF)' : 'GDP (current USD)';
                                        setHoveredIndex(i);
                                        setHoveredPoint({
                                            xPos: MARGIN.left + xScale(point.x) - 150,
                                            yPos: MARGIN.top + yScale(point.y) - 10,
                                            year: point.year,
                                            metricValue: `Metric value: ${formatValue(point.y)}`,
                                            gdpValue: `${gdpLabel}: ${formatGDP(point.x)}`
                                        });
                                    }}
                                    onMouseLeave={() => {
                                        setHoveredIndex(null);
                                        setHoveredPoint(null);
                                    }}
                                />
                            );
                        })}

                        {/* Connection line showing trajectory (all points in temporal order) */}
                        {hoveredIndex !== null && scatterData.length > 0 && (
                            <path
                                d={d3.line()
                                    .x(d => xScale(d.x))
                                    .y(d => yScale(d.y))
                                    ([...scatterData].sort((a, b) => a.year - b.year))}
                                fill="none"
                                stroke="#888"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                                opacity={0.7}
                                style={{ pointerEvents: 'none' }}
                            />
                        )}

                        {/* Year labels for first, median, and last points */}
                        {(() => {
                            if (scatterData.length === 0) return null;
                            
                            // Sort points by year
                            const sortedByYear = [...scatterData].sort((a, b) => a.year - b.year);
                            const first = sortedByYear[0];
                            const last = sortedByYear[sortedByYear.length - 1];
                            
                            // Calculate median index (adjusted for odd/even)
                            const midIndex = sortedByYear.length % 2 === 0 
                                ? sortedByYear.length / 2 - 1
                                : Math.floor(sortedByYear.length / 2);
                            const median = sortedByYear[midIndex];
                            
                            const pointsToLabel = [first, median, last];
                            const labelFontSize = Math.max(8, width * 0.013);
                            
                            // Estimate label dimensions (year is 4 digits max)
                            const labelWidth = 25;
                            const labelHeight = labelFontSize + 4;
                            const pointRadius = 6;
                            const collisionBuffer = 4;
                            
                            // Candidate positions: [dx, dy, textAnchor]
                            const candidatePositions = [
                                { dx: 0, dy: -8, textAnchor: 'middle' },   // Above
                                { dx: 0, dy: 14, textAnchor: 'middle' },   // Below
                                { dx: -20, dy: -8, textAnchor: 'end' },    // Left-above
                                { dx: 20, dy: -8, textAnchor: 'start' },   // Right-above
                                { dx: -20, dy: 14, textAnchor: 'end' },    // Left-below
                                { dx: 20, dy: 14, textAnchor: 'start' },   // Right-below
                                { dx: 0, dy: -16, textAnchor: 'middle' },  // Well above (2x distance)
                            ];
                            
                            // Already placed label positions
                            const placedLabels = [];
                            const finalPositions = []; // {x, y, textAnchor, point}
                            
                            // Find position for each label
                            pointsToLabel.forEach((point) => {
                                let finalX, finalY, finalTextAnchor;
                                
                                // Try candidate positions in order
                                for (const pos of candidatePositions) {
                                    let labelX = xScale(point.x) + pos.dx;
                                    let labelY = yScale(point.y) + pos.dy;
                                    
                                    // Ensure label center is closest to its own point
                                    const labelCenterX = pos.textAnchor === 'end' ? labelX - labelWidth :
                                        pos.textAnchor === 'start' ? labelX + labelWidth : labelX;
                                    const labelCenterY = labelY - labelHeight / 2;
                                    
                                    const ownPointX = xScale(point.x);
                                    const ownPointY = yScale(point.y);
                                    const ownDistSq = (labelCenterX - ownPointX) ** 2 + (labelCenterY - ownPointY) ** 2;
                                    
                                    let minOtherDistSq = Infinity;
                                    for (const otherPoint of scatterData) {
                                        if (otherPoint === point) continue;
                                        const otherX = xScale(otherPoint.x);
                                        const otherY = yScale(otherPoint.y);
                                        const distSq = (labelCenterX - otherX) ** 2 + (labelCenterY - otherY) ** 2;
                                        if (distSq < minOtherDistSq) {
                                            minOtherDistSq = distSq;
                                        }
                                    }
                                    
                                    if (minOtherDistSq < ownDistSq) {
                                        continue;
                                    }
                                    
                                    // Clamp and check collisions
                                    let clampedLabelX = labelX;
                                    let clampedLabelY = labelY;
                                    
                                    let boxX = pos.textAnchor === 'end' ? clampedLabelX - labelWidth :
                                        pos.textAnchor === 'start' ? clampedLabelX : clampedLabelX - labelWidth/2;
                                    let boxY = clampedLabelY - labelHeight;
                                    
                                    if (boxX < 0) {
                                        clampedLabelX = pos.textAnchor === 'end' ? labelWidth :
                                            pos.textAnchor === 'start' ? 0 : labelWidth/2;
                                        boxX = 0;
                                    } else if (boxX + labelWidth > boundsWidth) {
                                        clampedLabelX = pos.textAnchor === 'end' ? boundsWidth :
                                            pos.textAnchor === 'start' ? boundsWidth - labelWidth : boundsWidth - labelWidth/2;
                                        boxX = boundsWidth - labelWidth;
                                    }
                                    
                                    if (boxY < 0) {
                                        clampedLabelY = labelHeight;
                                        boxY = 0;
                                    } else if (boxY + labelHeight > boundsHeight) {
                                        clampedLabelY = boundsHeight;
                                        boxY = boundsHeight - labelHeight;
                                    }
                                    
                                    labelX = clampedLabelX;
                                    labelY = clampedLabelY;
                                    
                                    const labelBox = { x: boxX, y: boxY, width: labelWidth, height: labelHeight };
                                    
                                    const pointBox = {
                                        x: xScale(point.x) - pointRadius - collisionBuffer,
                                        y: yScale(point.y) - pointRadius - collisionBuffer,
                                        width: (pointRadius + collisionBuffer) * 2,
                                        height: (pointRadius + collisionBuffer) * 2
                                    };
                                    
                                    if (rectsIntersect(labelBox, pointBox)) continue;
                                    
                                    let collidesWithPoint = false;
                                    for (const otherPoint of scatterData) {
                                        if (otherPoint === point) continue;
                                        const otherPointBox = {
                                            x: xScale(otherPoint.x) - pointRadius - collisionBuffer,
                                            y: yScale(otherPoint.y) - pointRadius - collisionBuffer,
                                            width: (pointRadius + collisionBuffer) * 2,
                                            height: (pointRadius + collisionBuffer) * 2
                                        };
                                        if (rectsIntersect(labelBox, otherPointBox)) {
                                            collidesWithPoint = true;
                                            break;
                                        }
                                    }
                                    if (collidesWithPoint) continue;
                                    
                                    let collidesWithLabel = false;
                                    for (const placed of placedLabels) {
                                        if (rectsIntersect(labelBox, placed.box)) {
                                            collidesWithLabel = true;
                                            break;
                                        }
                                    }
                                    if (collidesWithLabel) continue;
                                    
                                    finalX = labelX;
                                    finalY = labelY;
                                    finalTextAnchor = pos.textAnchor;
                                    placedLabels.push({ box: labelBox });
                                    break;
                                }
                                
                                // If no candidate worked, use fallback
                                if (finalX === undefined) {
                                    finalX = xScale(point.x);
                                    finalY = yScale(point.y) - 16;
                                    finalTextAnchor = 'middle';
                                    
                                    let fbBoxX = finalX - labelWidth/2;
                                    let fbBoxY = finalY - labelHeight;
                                    if (fbBoxX < 0) {
                                        finalX = labelWidth/2;
                                        fbBoxX = 0;
                                    } else if (fbBoxX + labelWidth > boundsWidth) {
                                        finalX = boundsWidth - labelWidth/2;
                                        fbBoxX = boundsWidth - labelWidth;
                                    }
                                    if (fbBoxY < 0) {
                                        finalY = labelHeight;
                                        fbBoxY = 0;
                                    } else if (fbBoxY + labelHeight > boundsHeight) {
                                        finalY = boundsHeight;
                                        fbBoxY = boundsHeight - labelHeight;
                                    }
                                    placedLabels.push({ box: { x: fbBoxX, y: fbBoxY, width: labelWidth, height: labelHeight } });
                                }
                                
                                finalPositions.push({ x: finalX, y: finalY, textAnchor: finalTextAnchor, point });
                            });
                            
                            // Single render path for all labels
                            return (
                                <>
                                    {finalPositions.map((lp, idx) => (
                                        <>
                                            <line
                                                key={`year-line-${idx}`}
                                                x1={xScale(lp.point.x)}
                                                y1={yScale(lp.point.y)}
                                                x2={lp.x}
                                                y2={lp.y}
                                                stroke="#999"
                                                strokeWidth={0.8}
                                                style={{ pointerEvents: 'none' }}
                                            />
                                            <text
                                                key={`year-label-${idx}`}
                                                x={lp.x}
                                                y={lp.y}
                                                fontSize={labelFontSize}
                                                textAnchor={lp.textAnchor}
                                                fill="#333"
                                                fontFamily={FONT_FAMILY}
                                            >
                                                {lp.point.year}
                                            </text>
                                        </>
                                    ))}
                                </>
                            );
                        })()}
                        
                        {/* Axes */}
                        <AxisBottom 
                            xScale={xScale} 
                            pixelsPerTick={100} 
                            boundsHeight={boundsHeight} 
                            label={effectiveXAxisLabel}
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
                
                {/* Tooltip */}
                <Tooltip interactionData={hoveredPoint} />
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
                className={`border-l border-gray-200 p-4 rounded-lg shadow-sm overflow-y-auto ${isMobileLayout ? 'w-full order-first' : 'shrink-0'}`}
                style={{ width: isMobileLayout ? '100%' : `${paneWidth}px`, height: isMobileLayout ? 'auto' : chartHeight}}
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
                        <option value="alphabetical">Sort by: Name (A-Z)</option>
                        <option value="n_observations">Sort by: # of datapoints (high to low)</option>
                        <option value="r2_desc">Sort by: R² (best to worst)</option>
                        <option value="r2_asc">Sort by: R² (worst to best)</option>
                        
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
                <div 
                    className="space-y-1"
                    ref={metricListRef}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (!filteredSeriesKeys.length) return;
                        const currentIndex = selectedMetric ? filteredSeriesKeys.indexOf(selectedMetric) : -1;
                        if (e.key === 'ArrowUp' && currentIndex > 0) {
                            e.preventDefault();
                            handleSelectMetric(filteredSeriesKeys[currentIndex - 1]);
                        } else if (e.key === 'ArrowDown' && currentIndex < filteredSeriesKeys.length - 1) {
                            e.preventDefault();
                            handleSelectMetric(filteredSeriesKeys[currentIndex + 1]);
                        }
                    }}
                >
                    {filteredSeriesKeys.map((key, index) => {
                        const isSelected = selectedMetric === key;
                        const regResult = regressionResults.find(r => r.target_metric === key && r.predictor_type === selectedPredictorType);
                        
                        // Get database name for color (WISE, SPI2025, etc.)
                        const metricMetadata = metadata.find(m => m.full_name === key);
                        const dbName = metricMetadata?.database_name || getCategoryFromName(key);
                        const color = CATEGORY_COLORS[dbName] || COLORS[0];
                        
                        // Check if we're transitioning from GDP metrics to regular metrics
                        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
                        const isTransition = index > 0 && 
                            gdpMetrics.includes(filteredSeriesKeys[index - 1]) && 
                            !gdpMetrics.includes(key);
                        
                        return (
                            <>
                                {isTransition && <hr className="my-2 border-gray-300" />}
                                <div 
                                    data-metric-key={key}
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
                        </>
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
export const ResponsiveScatterplotWithRegression = ({ width = 800, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    
    const finalWidth = chartSize?.width || width;
    
    return (
        <div ref={chartRef} style={{ width: '90vw' }}>
            <ScatterplotWithRegression
                width={finalWidth}
                {...props}
            />
        </div>
    );
};

export default ScatterplotWithRegression;
