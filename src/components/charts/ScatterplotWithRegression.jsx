/*
 * Scatterplot with Regression Line
 * Responsive component with square axis area
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as d3 from 'd3';
import { useDimensions } from '../../../hooks/use-dimensions';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
import { Tooltip } from '../ui/Tooltip';
import { SearchBar } from '../ui/SearchBar';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const COLORS = d3.schemeTableau10;

// Category colors for consistent styling
const CATEGORY_COLORS = {
    'WISE': COLORS[0],
    'SPI2025': COLORS[1],
    'SPI2023': COLORS[3],
    'GDP': COLORS[9],
    'Population': COLORS[9],
    'OFS': COLORS[4],
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
 */
function formatMetricName(name) {
    // Special formatting for GDP metrics
    if (name === 'GDP_GDP_current_USD_WorldBank_per_capita') return 'GDP per capita in USD (current)';
    if (name === 'GDP_GDP_constant_LCU_WorldBank_per_capita') return 'GDP per capita in CHF (constant LCU)';
    
    const dbPrefix = getCategoryFromName(name);
    if (dbPrefix === 'Other') return name.replace(/_/g, ' ');
    const prefixMatch = name.match(/^([A-Z0-9]+)_/);
    const actualPrefix = prefixMatch ? prefixMatch[1] : '';
    const cleanName = name.replace(new RegExp(`^${actualPrefix}_`), '').replace(/_/g, ' ');
    const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
    return `${formattedName} (${dbPrefix.toUpperCase()})`;
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
 * Generate points for a regression line/curve
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
                y = params.lin_intercept || 0;
                break;
            default:
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
 * Get R² value from regression result
 */
function getR2Value(regression) {
    if (!regression) return null;
    const model = regression.best_model;
    const modelToCol = {
        'linear': 'r2_linear',
        'logarithmic': 'r2_log',
        'michaelis_menten': 'r2_mm',
        'exp_saturating': 'r2_expsat'
    };
    if (modelToCol[model]) {
        return regression[modelToCol[model]];
    }
    return Math.max(
        regression.r2_linear || 0,
        regression.r2_log || 0,
        regression.r2_mm || 0,
        regression.r2_expsat || 0
    );
}

/**
 * Main scatterplot component with square axis area
 */
export const ScatterplotWithRegression = ({
    data = [],
    seriesKeys = [],
    regressionResults = [],
    metadata = [],
    selectedMetric,
    onSelectMetric,
    searchQuery = '',
    onSearchChange,
    sortBy = 'alphabetical',
    onSortChange,
    selectedCategories = [],
    onCategoriesChange,
    selectedModelTypes = [],
    onModelTypesChange,
    selectedPredictorType = 'CHF_LCU',
    onPredictorChange,
    paneWidth: externalPaneWidth,
    onPaneWidthChange,
    onSwitchToLineChart,
    xDomain: externalXDomain,
    onXDomainChange: externalOnXDomainChange,
    gdpRange: externalGdpRange,
    width = 800,
    ...props
}) => {
    // Controlled xDomain from props
    const setXDomain = externalOnXDomainChange !== undefined ? externalOnXDomainChange : (() => {});
    // Constants
    const MARGIN = { top: 80, right: 30, bottom: 70, left: 110 };
    const GAP = 16;
    const PANE_WIDTH = 200;
    const MOBILE_BREAKPOINT = 600;
    const MIN_PANE_WIDTH = 150;
    const MAX_PANE_WIDTH = 400;
    
    // Controlled pane width
    const paneWidth = externalPaneWidth !== undefined ? externalPaneWidth : PANE_WIDTH;
    const setPaneWidth = onPaneWidthChange !== undefined ? onPaneWidthChange : (() => {});
    const setSearchQuery = onSearchChange !== undefined ? onSearchChange : (() => {});
    const setSortBy = onSortChange !== undefined ? onSortChange : (() => {});
    const setSelectedCategories = onCategoriesChange !== undefined ? onCategoriesChange : (() => {});
    const setSelectedModelTypes = onModelTypesChange !== undefined ? onModelTypesChange : (() => {});
    const setSelectedPredictorType = onPredictorChange !== undefined ? onPredictorChange : (() => {});
    const setSelectedMetric = onSelectMetric !== undefined ? onSelectMetric : (() => {});
    
    // State
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [isResizing, setIsResizing] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    
    // Refs
    const containerRef = useRef(null);
    const metricListRef = useRef(null);
    const isResizingRef = useRef(false);
    
    // Responsive layout
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const effectivePaneWidth = isMobileLayout ? 0 : paneWidth;
    const effectiveGap = isMobileLayout ? 0 : GAP;
    const availableWidth = width - effectivePaneWidth - effectiveGap;
    
    // Square axis area calculation with height scaling
    const totalHorizontalMargin = MARGIN.left + MARGIN.right;
    const totalVerticalMargin = MARGIN.top + MARGIN.bottom;
    const marginDifference = totalVerticalMargin - totalHorizontalMargin;
    // const scale = 0.9; // Height scaling factor
    // const scale = width < 700 ? 1.2 : 0.8;
    const scale = window.innerWidth < 1300 ? 0.85 : 0.8;
    const chartWidth = availableWidth * scale;
    const chartHeight = chartWidth + marginDifference;
    const boundsWidth = chartWidth - totalHorizontalMargin;
    const boundsHeight = chartHeight - totalVerticalMargin;
    const chartContainerHeight = isMobileLayout ? chartHeight + 100 : chartHeight;
    //const textOffset = chartHeight * 0.12; // Relative positioning for text
    const textOffset = Math.min(40, chartHeight * 0.12);

    // Font sizes based on width
    const titleFontSize = Math.max(14, width * 0.022);
    const axisLabelFontSize = Math.max(10, width * 0.015);
    const tickFontSize = Math.max(8, width * 0.015);
    const itemFontSize = Math.max(11, width * 0.015);
    
    // GDP key based on predictor type
    const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
    
    // Effective axis labels
    const effectiveXAxisLabel = selectedPredictorType === 'CHF_LCU' 
        ? 'GDP per capita (CHF, constant LCU)' 
        : 'GDP per capita (current $USD)';
    
    // Scatter data for selected metric - filtered by x-domain when slider is active
    const scatterData = useMemo(() => {
        if (!selectedMetric) return [];
        return data
            .filter(d => {
                const xVal = d[gdpKey];
                const yVal = d[selectedMetric];
                const hasValidXY = xVal !== null && xVal !== undefined && yVal !== null && yVal !== undefined;
                const inXRange = externalXDomain === undefined 
                    || (xVal >= externalXDomain[0] && xVal <= externalXDomain[1]);
                return hasValidXY && inXRange;
            })
            .map(d => ({
                x: d[gdpKey],
                y: d[selectedMetric],
                year: d.year
            }));
    }, [selectedMetric, data, gdpKey, externalXDomain]);
    
    // Regression result for selected metric
    const regressionForMetric = useMemo(() => {
        if (!selectedMetric) return null;
        return regressionResults.find(r => r.target_metric === selectedMetric && r.predictor_type === selectedPredictorType);
    }, [selectedMetric, regressionResults, selectedPredictorType]);
    
    // X and Y domains
    const defaultXDomain = useMemo(() => {
        if (scatterData.length === 0) {
            const gdpValues = data.map(d => d[gdpKey]).filter(v => v !== null && v !== undefined);
            if (gdpValues.length === 0) return [0, 100];
            return d3.extent(gdpValues);
        }
        const xValues = scatterData.map(d => d.x);
        return d3.extent(xValues);
    }, [scatterData, data, gdpKey]);
    
    // Use controlled xDomain from props, fallback to calculation
    const effectiveXDomain = externalXDomain !== undefined ? externalXDomain : defaultXDomain;
    
    const yDomain = useMemo(() => {
        if (scatterData.length === 0) return [0, 1];
        const yValues = scatterData.map(d => d.y).filter(y => y !== null && y !== undefined && !isNaN(y) && isFinite(y));
        if (yValues.length === 0) return [0, 1];
        const [minY, maxY] = d3.extent(yValues);
        const range = maxY - minY;
        if (Math.abs(range) < 1e-10) {
            const center = (minY + maxY) / 2;
            const padding = Math.max(Math.abs(center), 1) * 0.1;
            return [center - padding, center + padding];
        }
        const padding = range * 0.1;
        return [minY - padding, maxY + padding];
    }, [scatterData]);
    
    // Generate regression curve points
    const regressionPoints = useMemo(() => {
        if (!regressionForMetric || regressionForMetric.best_model === 'other' || regressionForMetric.best_model === 'constant') return [];
        return generateRegressionPoints(
            regressionForMetric.best_model,
            regressionForMetric,
            effectiveXDomain,
            100
        );
    }, [regressionForMetric, effectiveXDomain]);
    
    // D3 scales
    const xScale = useMemo(() => {
        return d3.scaleLinear()
            .domain([effectiveXDomain[0], effectiveXDomain[1]])
            .range([0, boundsWidth]);
    }, [effectiveXDomain, boundsWidth]);
    
    const yScale = useMemo(() => {
        return d3.scaleLinear()
            .domain([yDomain[0], yDomain[1]])
            .range([boundsHeight, 0]);
    }, [yDomain, boundsHeight]);
    
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
        return "Metric Value";
    }, [selectedMetric, metricToUnit]);
    
    // Get all unique categories from metadata
    const allCategories = useMemo(() => {
        const categories = metadata.map(m => m.category);
        return [...new Set(categories)].filter(c => c);
    }, [metadata]);
    
    // Category filter button text
    const categoryButtonText = useMemo(() => {
        if (selectedCategories.length === 0) return "None";
        if (selectedCategories.length === allCategories.length) return "Filter by category";
        return selectedCategories.join(", ");
    }, [selectedCategories, allCategories]);
    
    // All model type display categories with direction
    const ALL_MODEL_TYPES = useMemo(() => [
        'Undefined', 'Constant',
        '↑ Linear', '↓ Linear',
        '↑ Saturating', '↓ Saturating'
    ], []);
    
    // Get display category from regression result
    const getModelDisplayCategory = useCallback((regResult) => {
        if (!regResult) return 'Undefined';
        const model = regResult.best_model;
        if (model === 'constant') return 'Constant';
        if (model === 'other') return 'Undefined';
        if (model === 'linear') return regResult.lin_slope >= 0 ? '↑ Linear' : '↓ Linear';
        if (model === 'michaelis_menten') return regResult.mm_vmax >= 0 ? '↑ Saturating' : '↓ Saturating';
        if (model === 'exp_saturating') return regResult.sat_c >= 0 ? '↑ Saturating' : '↓ Saturating';
        if (model === 'logarithmic') return regResult.log_b >= 0 ? '↑ Saturating' : '↓ Saturating';
        return 'Undefined';
    }, []);
    
    // Get display category for each metric
    const metricToDisplayCategory = useMemo(() => {
        const map = {};
        regressionResults.forEach(r => {
            if (r.predictor_type !== selectedPredictorType) return;
            map[r.target_metric] = getModelDisplayCategory(r);
        });
        seriesKeys.forEach(key => {
            if (!(key in map)) {
                map[key] = 'Undefined';
            }
        });
        return map;
    }, [regressionResults, getModelDisplayCategory, selectedPredictorType, seriesKeys]);
    
    // Get count of metrics for each model type
    const modelTypeCounts = useMemo(() => {
        const counts = {};
        ALL_MODEL_TYPES.forEach(cat => counts[cat] = 0);
        regressionResults.forEach(r => {
            if (r.predictor_type !== selectedPredictorType) return;
            const category = getModelDisplayCategory(r);
            counts[category] = (counts[category] || 0) + 1;
        });
        const metricsWithResults = new Set(regressionResults
            .filter(r => r.predictor_type === selectedPredictorType)
            .map(r => r.target_metric));
        const undefinedCount = seriesKeys.filter(k => !metricsWithResults.has(k)).length;
        counts['Undefined'] = (counts['Undefined'] || 0) + undefinedCount;
        return counts;
    }, [regressionResults, getModelDisplayCategory, ALL_MODEL_TYPES, selectedPredictorType, seriesKeys]);
    
    // Model filter button text
    const modelButtonText = useMemo(() => {
        if (selectedModelTypes.length === 0) return "None";
        if (selectedModelTypes.length === ALL_MODEL_TYPES.length) return "Filter by model type";
        return selectedModelTypes.map(mt => `${mt} (${modelTypeCounts[mt] || 0})`).join(", ");
    }, [selectedModelTypes, ALL_MODEL_TYPES, modelTypeCounts]);
    
    // Check if a metric's display category matches selected model types
    const matchesModelFilter = useCallback((metricName) => {
        if (selectedModelTypes.length === 0) return false;
        const displayCategory = metricToDisplayCategory[metricName];
        if (!displayCategory) return false;
        return selectedModelTypes.includes(displayCategory);
    }, [selectedModelTypes, metricToDisplayCategory]);
    
    // Filter and sort metric list
    const filteredSeriesKeys = useMemo(() => {
        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
        
        // Always include GDP metrics at top
        const gdpInList = gdpMetrics.filter(key => seriesKeys.includes(key));
        
        // Regular metrics with all filters applied
        let regularMetrics = seriesKeys.filter(key => {
            const isGDP = gdpMetrics.includes(key);
            const matchesSearch = key.toLowerCase().includes(searchQuery.toLowerCase());
            const category = metricToCategory[key];
            const matchesCategory = selectedCategories.length === 0 || (category && selectedCategories.includes(category));
            const matchesModel = selectedModelTypes.length === 0 || matchesModelFilter(key);
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
            gdpInList.sort((a, b) => a.localeCompare(b));
            regularMetrics.sort((a, b) => a.localeCompare(b));
        }
        
        return [...gdpInList, ...regularMetrics];
    }, [seriesKeys, searchQuery, sortBy, regressionResults, selectedCategories, selectedModelTypes, matchesModelFilter, metricToCategory, selectedPredictorType]);
    
    // Handle metric selection with GDP switch
    const handleSelectMetric = useCallback((metric) => {
        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
        if (gdpMetrics.includes(metric) && onSwitchToLineChart) {
            onSwitchToLineChart();
            setSelectedMetric(metric);
        } else {
            setSelectedMetric(prev => prev === metric ? null : metric);
        }
    }, [onSwitchToLineChart, setSelectedMetric]);
    
    // Handle clear selection
    const clearSelection = useCallback(() => {
        setSelectedMetric(null);
    }, [setSelectedMetric]);
    
    // Handle pane resize
    const handleResize = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current || isMobileLayout) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const newWidth = rect.width - (clientX - rect.left);
        const constrainedWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, newWidth));
        setPaneWidth(constrainedWidth);
    }, [isMobileLayout, setPaneWidth]);
    
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
    
    // Cleanup event listeners
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
    
    // Auto-scroll to selected metric
    useEffect(() => {
        if (selectedMetric && metricListRef.current) {
            const el = metricListRef.current.querySelector(`[data-metric-key="${selectedMetric}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedMetric]);
    
    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (!filteredSeriesKeys.length) return;
        const currentIndex = selectedMetric ? filteredSeriesKeys.indexOf(selectedMetric) : -1;
        if (e.key === 'ArrowUp' && currentIndex > 0) {
            e.preventDefault();
            handleSelectMetric(filteredSeriesKeys[currentIndex - 1]);
        } else if (e.key === 'ArrowDown' && currentIndex < filteredSeriesKeys.length - 1) {
            e.preventDefault();
            handleSelectMetric(filteredSeriesKeys[currentIndex + 1]);
        }
    }, [filteredSeriesKeys, selectedMetric, handleSelectMetric]);

    return (
        <div ref={containerRef} className="flex flex-col md:flex-row relative" style={{ width, height: chartContainerHeight, fontFamily: FONT_FAMILY }}>
            {/* Chart Area */}
            <div className="relative mr-8" style={{ width: chartWidth, height: chartContainerHeight }}>
                <svg
                    width={chartWidth}
                    height={chartHeight}
                    style={{ display: 'block' }}
                >
                    {/* Chart Group - translated to account for margins */}
                    <g transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}>
                        {/* Title */}
                        {selectedMetric && (
                            <text
                                x={0}
                                y={-MARGIN.top/1.5}
                                fontSize={titleFontSize}
                                textAnchor="middle"
                                fill="#333"
                                fontWeight="bold"
                            >
                                {(() => {
                                    const name = formatMetricName(selectedMetric);
                                    const years = scatterData.map(d => d.year);
                                    const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : '';
                                    const displayName = yearRange ? `${name} - ${yearRange}` : name;
                                    
                                    if (displayName.length > 30) {
                                        const words = displayName.split(' ');
                                        const mid = Math.ceil(words.length / 2);
                                        return (
                                            <>
                                                <tspan x={chartWidth/3} dy={0}>{words.slice(0, mid).join(' ')}</tspan>
                                                <tspan x={chartWidth/3} dy={titleFontSize + 4}>{words.slice(mid).join(' ')}</tspan>
                                            </>
                                        );
                                    }
                                    return displayName;
                                })()}
                            </text>
                        )}
                        
                        {/* Regression info */}
                        {regressionForMetric && selectedMetric && (
                            <text
                                x={chartWidth / 3}
                                y={titleFontSize*0.1}
                                fontSize={Math.max(12, width * 0.018)}
                                textAnchor="middle"
                                fill="#666"
                            >
                                Best fit:{' '}
                                {regressionForMetric.best_model === 'other' ? (
                                    <>
                                        <tspan style={{ textDecoration: 'underline' }}>undefined</tspan>
                                        {getR2Value(regressionForMetric) && ` (Best fit R² = ${getR2Value(regressionForMetric)?.toFixed(3)})`}
                                    </>
                                ) : (
                                    <>
                                        <tspan style={{ textDecoration: 'underline' }}>{regressionForMetric.best_model}</tspan>
                                        {getR2Value(regressionForMetric) && ` (R² = ${getR2Value(regressionForMetric).toFixed(3)})`}
                                    </>
                                )}
                            </text>
                        )}
                        
                        {regressionForMetric === null && selectedMetric && (
                            <text x={chartWidth / 2} y={chartHeight / 2} fontSize={Math.max(12, width * 0.015)} textAnchor="middle" fill="#999">
                                No regression data available
                            </text>
                        )}
                        
                        {/* No data message */}
                        {selectedMetric && scatterData.length === 0 && (
                            <text x={chartWidth / 2.5} y={chartHeight/3} fontSize={titleFontSize * 2} textAnchor="middle" fill="#999">
                                No data matching with
                                <tspan x={chartWidth / 2.5} dy={titleFontSize * 1.8}>GDP year range</tspan>
                            </text>
                        )}
                        {/* Regression line */}
                        {regressionPoints.length > 0 && regressionForMetric && regressionForMetric.best_model !== 'other' && (
                            <path
                                d={d3.line()
                                    .x(d => xScale(d.x))
                                    .y(d => yScale(d.y))
                                    (regressionPoints.filter(d => d.y >= yDomain[0] && d.y <= yDomain[1]))}
                                fill="none"
                                stroke="#8627ce"
                                strokeWidth={3}
                                strokeDasharray="5,5"
                                style={{ pointerEvents: 'none' }}
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
                                    r={Math.max(3, width * 0.005)}
                                    fill="black"
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
                        
                        {/* Trajectory line (on hover) */}
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
                        
                        {/* Year labels for first, median, last points */}
                        {(() => {
                            if (scatterData.length === 0) return null;
                            const sortedByYear = [...scatterData].sort((a, b) => a.year - b.year);
                            const first = sortedByYear[0];
                            const last = sortedByYear[sortedByYear.length - 1];
                            const midIndex = sortedByYear.length % 2 === 0 
                                ? sortedByYear.length / 2 - 1
                                : Math.floor(sortedByYear.length / 2);
                            const median = sortedByYear[midIndex];
                            const pointsToLabel = [first, median, last];
                            const labelFontSize = Math.max(8, width * 0.013);
                            const labelWidth = 25;
                            const labelHeight = labelFontSize + 4;
                            const pointRadius = 6;
                            const collisionBuffer = 4;
                            const candidatePositions = [
                                { dx: 0, dy: -8, textAnchor: 'middle' },
                                { dx: 0, dy: 14, textAnchor: 'middle' },
                                { dx: -20, dy: -8, textAnchor: 'end' },
                                { dx: 20, dy: -8, textAnchor: 'start' },
                                { dx: -20, dy: 14, textAnchor: 'end' },
                                { dx: 20, dy: 14, textAnchor: 'start' },
                            ];
                            const placedLabels = [];
                            const finalPositions = [];
                            
                            pointsToLabel.forEach((point) => {
                                let finalX, finalY, finalTextAnchor;
                                for (const pos of candidatePositions) {
                                    let labelX = xScale(point.x) + pos.dx;
                                    let labelY = yScale(point.y) + pos.dy;
                                    const labelCenterX = pos.textAnchor === 'end' ? labelX - labelWidth :
                                        pos.textAnchor === 'start' ? labelX + labelWidth : labelX;
                                    const labelCenterY = labelY - labelHeight / 2;
                                    const ownDistSq = (labelCenterX - xScale(point.x)) ** 2 + (labelCenterY - yScale(point.y)) ** 2;
                                    let minOtherDistSq = Infinity;
                                    for (const otherPoint of scatterData) {
                                        if (otherPoint === point) continue;
                                        const distSq = (labelCenterX - xScale(otherPoint.x)) ** 2 + (labelCenterY - yScale(otherPoint.y)) ** 2;
                                        if (distSq < minOtherDistSq) minOtherDistSq = distSq;
                                    }
                                    if (minOtherDistSq < ownDistSq) continue;
                                    const pointBox = {
                                        x: xScale(point.x) - pointRadius - collisionBuffer,
                                        y: yScale(point.y) - pointRadius - collisionBuffer,
                                        width: (pointRadius + collisionBuffer) * 2,
                                        height: (pointRadius + collisionBuffer) * 2
                                    };
                                    let clampedLabelX = labelX;
                                    let clampedLabelY = labelY;
                                    let boxX = pos.textAnchor === 'end' ? clampedLabelX - labelWidth :
                                        pos.textAnchor === 'start' ? clampedLabelX : clampedLabelX - labelWidth/2;
                                    let boxY = clampedLabelY - labelHeight;
                                    if (boxX < 0) { clampedLabelX = pos.textAnchor === 'end' ? labelWidth : pos.textAnchor === 'start' ? 0 : labelWidth/2; boxX = 0; }
                                    if (boxX + labelWidth > boundsWidth) { clampedLabelX = pos.textAnchor === 'end' ? boundsWidth : pos.textAnchor === 'start' ? boundsWidth - labelWidth : boundsWidth - labelWidth/2; boxX = boundsWidth - labelWidth; }
                                    if (boxY < 0) { clampedLabelY = labelHeight; boxY = 0; }
                                    if (boxY + labelHeight > boundsHeight) { clampedLabelY = boundsHeight; boxY = boundsHeight - labelHeight; }
                                    const labelBox = { x: boxX, y: boxY, width: labelWidth, height: labelHeight };
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
                                        if (rectsIntersect(labelBox, otherPointBox)) { collidesWithPoint = true; break; }
                                    }
                                    if (collidesWithPoint) continue;
                                    let collidesWithLabel = false;
                                    for (const placed of placedLabels) {
                                        if (rectsIntersect(labelBox, placed.box)) { collidesWithLabel = true; break; }
                                    }
                                    if (collidesWithLabel) continue;
                                    finalX = clampedLabelX; finalY = clampedLabelY; finalTextAnchor = pos.textAnchor;
                                    placedLabels.push({ box: labelBox });
                                    break;
                                }
                                if (finalX === undefined) {
                                    finalX = xScale(point.x);
                                    finalY = yScale(point.y) - 16;
                                    finalTextAnchor = 'middle';
                                }
                                finalPositions.push({ x: finalX, y: finalY, textAnchor: finalTextAnchor, point });
                            });
                            return (
                                <>
                                    {finalPositions.map((lp, idx) => (
                                        <g key={`year-label-${idx}`}>
                                            <line
                                                x1={xScale(lp.point.x)}
                                                y1={yScale(lp.point.y)}
                                                x2={lp.x}
                                                y2={lp.y}
                                                stroke="#999"
                                                strokeWidth={0.8}
                                                style={{ pointerEvents: 'none' }}
                                            />
                                            <text
                                                x={lp.x}
                                                y={lp.y}
                                                fontSize={labelFontSize}
                                                textAnchor={lp.textAnchor}
                                                fill="#333"
                                            >
                                                {lp.point.year}
                                            </text>
                                        </g>
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
                            tickFormat={formatGDP}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                        />
                        <AxisLeft 
                            yScale={yScale} 
                            pixelsPerTick={60} 
                            boundsWidth={boundsWidth} 
                            label={effectiveYAxisLabel}
                            tickFormat={formatValue}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                        />
                    </g>
                </svg>
                
                {/* Tooltip */}
                <Tooltip interactionData={hoveredPoint} />
            </div>

            {/* Resizer handle - hidden on mobile */}
            {!isMobileLayout && (
                <div
                    className={`w-1 bg-gray-300 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors `}
                    onMouseDown={handleResizeStart}
                    onTouchStart={handleResizeStart}
                    style={{ height: chartContainerHeight, marginTop: 0 }}
                />
            )}

            {/* Side Pane */}
            <div 
                className={`border-l border-gray-200 p-4 rounded-lg shadow-sm overflow-y-auto overflow-x-hidden ${isMobileLayout ? 'w-full order-first' : 'flex-1'}`}
                style={{ 
                    minWidth: `${paneWidth}px`,  // Minimum width from resizer
                    height: isMobileLayout ? 'auto' : chartContainerHeight
                }}
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
                                    if (selectedModelTypes.length === ALL_MODEL_TYPES.length) {
                                        setSelectedModelTypes([]);
                                    } else {
                                        setSelectedModelTypes([...ALL_MODEL_TYPES]);
                                    }
                                }}
                                className="w-full text-left px-3 py-1 hover:bg-gray-50 cursor-pointer sticky top-0 bg-white border-b border-gray-200 flex items-center"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedModelTypes.length === ALL_MODEL_TYPES.length && ALL_MODEL_TYPES.length > 0}
                                    readOnly
                                    className="mr-2 h-4 w-4 pointer-events-none"
                                />
                                <span className="text-sm font-semibold">Select All</span>
                            </button>
                            {ALL_MODEL_TYPES.map(modelType => (
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
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
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
                    onKeyDown={handleKeyDown}
                >
                    {filteredSeriesKeys.map((key, index) => {
                        const isSelected = selectedMetric === key;
                        const regResult = regressionResults.find(r => r.target_metric === key && r.predictor_type === selectedPredictorType);
                        const metricMetadata = metadata.find(m => m.full_name === key);
                        const dbName = metricMetadata?.database_name || getCategoryFromName(key);
                        const color = CATEGORY_COLORS[dbName] || COLORS[0];
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
                                    <div 
                                        className="w-4 h-4 rounded border-2 shrink-0"
                                        style={{
                                            borderColor: color,
                                            backgroundColor: isSelected ? color : 'transparent'
                                        }}
                                    />
                                    <span 
                                        className="flex-1 text-sm break-words"
                                        style={{
                                            fontSize: itemFontSize,
                                            fontWeight: isSelected ? 'bold' : 'normal'
                                        }}
                                    >
                                        {formatMetricName(key)}
                                    </span>
                                    {regResult && (
                                        <span className="text-xs text-gray-400 whitespace-nowrap">
                                            {regResult.best_model === 'linear' ? 'Lin' : 
                                             regResult.best_model === 'logarithmic' ? 'Log' :
                                             regResult.best_model === 'michaelis_menten' ? 'MM' :
                                             regResult.best_model === 'exp_saturating' ? 'Sat' :
                                             regResult.best_model === 'constant' ? 'Cst' : '?'}
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
 * Responsive wrapper that sizes to 100% of parent width
 */
export const ResponsiveScatterplotWithRegression = ({ width = 800, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    const finalWidth = chartSize?.width || width;

    return (
        <div ref={chartRef} style={{ width: '100%' }}>
            <ScatterplotWithRegression
                width={finalWidth}
                {...props}
            />
        </div>
    );
};

export default ScatterplotWithRegression;
