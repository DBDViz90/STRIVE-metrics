/**
 * Multi-Metric Line Chart
 * Displays multiple metrics as line charts with % change on y-axis
 * Features a 3-section side pane for metric selection
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { AxisLeft } from '../Axes/AxisLeft';
import { AxisBottom } from '../Axes/AxisBottom';
import { SearchBar } from '../custom_ui/SearchBar';
import { Tooltip } from '../custom_ui/Tooltip';
import { Slider } from '../custom_ui/Slider';
import { useDimensions } from '../../../hooks/use-dimensions';

// Constants
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const DEFAULT_GDP_METRIC = 'GDP_GDP_constant_LCU_WorldBank_per_capita';
const COLORS = d3.schemeTableau10;

// Sort options
const SORT_OPTIONS = [
    { value: 'alphabetical', label: 'Sort by: Name (A-Z)' },
    { value: 'n_observations', label: 'Sort by: # of datapoints (high to low)' }
];

// Model types (matches ScatterplotWithRegression)
const ALL_MODEL_TYPES_CONST = [
    'Undefined', 'Constant',
    '↑ Linear', '↓ Linear',
    '↑ Saturating', '↓ Saturating'
];

// Category colors
const CATEGORY_COLORS = {
    'WISE': COLORS[0],
    'SPI2025': COLORS[1],
    'SPI2023': COLORS[3],
    'GDP': COLORS[9],
    'Population': COLORS[9],
    'OFS': COLORS[4],
};

// Line color palette (10 colorblind-friendly colors for multi-line chart)
const LINE_COLORS = d3.schemeTableau10;

// Helper function to get category from metric name (matches ScatterplotWithRegression)
function getCategoryFromName(metricName) {
    if (metricName.startsWith('WISE_')) return 'WISE';
    if (metricName.startsWith('SPI2025_')) return 'SPI2025';
    if (metricName.startsWith('SPI2023_')) return 'SPI2023';
    if (metricName.startsWith('GDP_')) return 'GDP';
    if (metricName.startsWith('POP_')) return 'Population';
    if (metricName.startsWith('OFS_')) return 'OFS';
    return 'Other';
}

// Format metric name with database suffix in parentheses (matches ScatterplotWithRegression)
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
 * Multi-Metric Line Chart Component
 * @param {Object} props
 * @param {Array} props.data - Array of data objects with year, metric values
 * @param {Array} props.seriesKeys - Array of metric keys
 * @param {Array} props.metadata - Metric metadata
 * @param {Array} props.regressionResults - Regression analysis results
 */
export const MultiMetricLineChart = ({
    data = [],
    seriesKeys = [],
    metadata = [],
    regressionResults = [],
    width = 800,
    height = 600
}) => {
    // Hardcoded to CHF_LCU as per user requirement
    const selectedPredictorType = 'CHF_LCU';
    // State for selected metrics (store full_name)
    const [selectedMetrics, setSelectedMetrics] = useState([DEFAULT_GDP_METRIC]);
    
    // Color assignment map: metricName -> color
    const [metricToColor, setMetricToColor] = useState({
        [DEFAULT_GDP_METRIC]: LINE_COLORS[0]
    });
    
    // State for side pane
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedModelTypes, setSelectedModelTypes] = useState(ALL_MODEL_TYPES_CONST);
    const [selectedCategories, setSelectedCategories] = useState(() => {
        const cats = [...new Set(metadata.map(m => m.category).filter(Boolean))];
        return cats;
    });
    const [sortBy, setSortBy] = useState('alphabetical');
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    // State for tooltip
    const [hoveredYear, setHoveredYear] = useState(null);
    const [tooltipData, setTooltipData] = useState(null);
    
    // State for metric label hover (to dim other metrics)
    const [hoveredMetric, setHoveredMetric] = useState(null);
    
    // State for dropdown visibility
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    
    // State for year range slider
    const [yearRange, setYearRange] = useState(null);
    
    // Ref for metric list scrolling
    const metricListRef = useRef(null);
    
    // Get all available categories from metadata
    const allCategories = useMemo(() => {
        const cats = new Set(metadata.map(m => m.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [metadata]);

    // Get display category from regression result (matches ScatterplotWithRegression)
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
    
    // Get all available database names from metadata
    const allDatabaseNames = useMemo(() => {
        const dbNames = new Set(metadata.map(m => m.database_name).filter(Boolean));
        return Array.from(dbNames);
    }, [metadata]);

    // Get or assign a unique color for a metric from the 12-color palette
    const getMetricColor = useCallback((metricName) => {
        if (metricToColor[metricName]) return metricToColor[metricName];
        
        // Find first available color index
        const usedColors = Object.values(metricToColor);
        for (let i = 0; i < LINE_COLORS.length; i++) {
            if (!usedColors.includes(LINE_COLORS[i])) {
                setMetricToColor(prev => ({ ...prev, [metricName]: LINE_COLORS[i] }));
                return LINE_COLORS[i];
            }
        }
        return LINE_COLORS[0]; // fallback if all 12 colors are used
    }, [metricToColor]);
    
    // Get category for each metric
    const getCategoryForMetric = (metricName) => {
        const meta = metadata.find(m => m.full_name === metricName);
        return meta?.category || 'Other';
    };
    
    // Get database name for each metric
    const getDatabaseForMetric = (metricName) => {
        const meta = metadata.find(m => m.full_name === metricName);
        return meta?.database_name || 'Other';
    };
    

    
    // Get display category for each metric (for current predictor)
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
    
    // Count metrics by model type for dropdown
    const modelTypeCounts = useMemo(() => {
        const counts = {};
        ALL_MODEL_TYPES_CONST.forEach(cat => counts[cat] = 0);
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
    }, [regressionResults, getModelDisplayCategory, ALL_MODEL_TYPES_CONST, selectedPredictorType, seriesKeys]);
    
    // Count metrics by category for dropdown
    const categoryCounts = useMemo(() => {
        const counts = {};
        allCategories.forEach(cat => counts[cat] = 0);
        
        seriesKeys.forEach(key => {
            const category = getCategoryForMetric(key);
            counts[category] = (counts[category] || 0) + 1;
        });
        
        return counts;
    }, [seriesKeys, metadata, allCategories]);
    
    // Check if a metric's display category matches selected model types
    const matchesModelFilter = useCallback((metricName) => {
        if (selectedModelTypes.length === 0) return false;
        const displayCategory = metricToDisplayCategory[metricName];
        if (!displayCategory) return false;
        return selectedModelTypes.includes(displayCategory);
    }, [selectedModelTypes, metricToDisplayCategory]);
    
    // Filter and sort metrics for section 3
    const filteredSeriesKeys = useMemo(() => {
        const gdpMetrics = ['GDP_GDP_current_USD_WorldBank_per_capita', 'GDP_GDP_constant_LCU_WorldBank_per_capita'];
        
        // Always include GDP metrics at top (unaffected by filters)
        const gdpInList = gdpMetrics.filter(key => seriesKeys.includes(key));
        
        // Regular metrics with all filters applied
        let regularMetrics = seriesKeys.filter(key => {
            const isGDP = gdpMetrics.includes(key);
            const matchesSearch = key.toLowerCase().includes(searchQuery.toLowerCase());
            const category = getCategoryForMetric(key);
            const matchesCategory = selectedCategories.length === 0 || (category && selectedCategories.includes(category));
            const matchesModel = selectedModelTypes.length > 0 && matchesModelFilter(key);
            return !isGDP && matchesSearch && matchesCategory && matchesModel;
        });
        
        // Sort both groups
        if (sortBy === 'n_observations') {
            const sortFn = (a, b) => {
                const aData = data.filter(d => d[a] !== undefined);
                const bData = data.filter(d => d[b] !== undefined);
                return bData.length - aData.length;
            };
            gdpInList.sort(sortFn);
            regularMetrics.sort(sortFn);
        } else {
            gdpInList.sort((a, b) => a.localeCompare(b));
            regularMetrics.sort((a, b) => a.localeCompare(b));
        }
        
        return [...gdpInList, ...regularMetrics];
    }, [seriesKeys, searchQuery, selectedCategories, selectedModelTypes, matchesModelFilter, sortBy, data]);
    

    

    
    // Toggle metric selection
    const toggleMetric = (metricName) => {
        setSelectedMetrics(prev => {
            const newSelection = [...prev];
            const index = newSelection.indexOf(metricName);
            if (index > -1) {
                newSelection.splice(index, 1);
                // Remove from color map
                setMetricToColor(prev => {
                    const newMap = { ...prev };
                    delete newMap[metricName];
                    return newMap;
                });
            } else {
                newSelection.unshift(metricName);
            }
            return newSelection;
        });
    };
    
    // Clear all selections
    const clearAllSelections = () => {
        setSelectedMetrics([DEFAULT_GDP_METRIC]);
    };
    
    // Check if a metric is selected
    const isMetricSelected = (metricName) => {
        return selectedMetrics.includes(metricName);
    };
    

    // Get button text for model dropdown (matches ScatterplotWithRegression)
    const modelButtonText = useMemo(() => {
        if (selectedModelTypes.length === 0) return "None";
        if (selectedModelTypes.length === ALL_MODEL_TYPES_CONST.length) return "Filter by model type";
        return selectedModelTypes.map(mt => `${mt} (${modelTypeCounts[mt] || 0})`).join(", ");
    }, [selectedModelTypes, ALL_MODEL_TYPES_CONST, modelTypeCounts]);
    
    // Get button text for category dropdown (matches ScatterplotWithRegression)
    const categoryButtonText = useMemo(() => {
        if (selectedCategories.length === 0) return "None";
        if (selectedCategories.length === allCategories.length) return "Filter by category";
        return selectedCategories.join(", ");
    }, [selectedCategories, allCategories]);
    
    // Ref for container
    const containerRef = useRef(null);
    
    // Constants matching ScatterplotWithRegression
    const MARGIN = { top: 80, right: 30, bottom: 70, left: 110 };
    const MOBILE_BREAKPOINT = 600;
    
    // Responsive layout
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const isPaneCollapsedState = isMobileLayout || isCollapsed;
    const scale = window.innerWidth < 1300 ? 0.85 : 0.8;
    
    // Chart sizing (matching ScatterplotWithRegression)
    const chartWidth = isPaneCollapsedState ? width * 0.8 : width * scale * 0.85;
    const totalHorizontalMargin = MARGIN.left + MARGIN.right;
    const totalVerticalMargin = MARGIN.top + MARGIN.bottom;
    const marginDifference = totalVerticalMargin - totalHorizontalMargin;
    const chartHeight = chartWidth + marginDifference;
    const boundsWidth = chartWidth - totalHorizontalMargin;
    const boundsHeight = chartHeight - totalVerticalMargin;
    const chartContainerHeight = isMobileLayout ? chartHeight + 100 : chartHeight;
    
    // Font sizes based on width (matching ScatterplotWithRegression)
    const titleFontSize = Math.max(14, width * 0.022);
    const axisLabelFontSize = Math.max(10, width * 0.017);
    const tickFontSize = Math.max(8, width * 0.015);
    const itemFontSize = Math.max(11, width * 0.015);
    const tooltipFontSize = Math.max(11, width * 0.013);
    
    // Calculate full year range from raw data (not filtered chartData)
    const fullYearRange = useMemo(() => {
        if (data.length === 0) return [1960, 2024];
        const allYears = data.map(d => d.year).filter(y => y !== null && y !== undefined);
        if (allYears.length === 0) return [1960, 2024];
        return d3.extent(allYears);
    }, [data]);

    useEffect(() => {
    if (yearRange === null && fullYearRange) {
        setYearRange(fullYearRange);
    }
    }, [fullYearRange]);

    // Initialize yearRange when data changes
    useEffect(() => {
        if (fullYearRange && fullYearRange.length === 2) {
            setYearRange(fullYearRange);
        }
    }, [fullYearRange]);

    // Effective year range: use slider range if set, otherwise full range
    const effectiveYearRange = useMemo(() => {
        if (yearRange && yearRange.length === 2) {
            return [Math.max(1960, yearRange[0]), Math.min(2024, yearRange[1])];
        }
        return fullYearRange;
    }, [yearRange, fullYearRange]);

    // Get data for selected metrics with % change calculation
    const chartData = useMemo(() => {
        if (selectedMetrics.length === 0) return [];
        
        const baselineYear = effectiveYearRange[0];
        
        // Group data by year
        const dataByYear = {};
        data.forEach(d => {
            if (!dataByYear[d.year]) {
                dataByYear[d.year] = { year: d.year };
            }
        });
        
        // For each selected metric, calculate % change from baselineYear
        selectedMetrics.forEach(metricName => {
            // Get all data points for this metric
            const metricData = data
                .filter(d => d[metricName] !== undefined && d[metricName] !== null)
                .sort((a, b) => a.year - b.year);
            
            if (metricData.length === 0) return;
            
            // Find baseline value at or closest to baselineYear
            let baselineValue = null;
            
            // Try exact match first
            const exactMatch = metricData.find(d => d.year === baselineYear);
            if (exactMatch) {
                baselineValue = exactMatch[metricName];
            } else {
                // Find closest year with data that is <= baselineYear
                const yearsBeforeOrAt = metricData.filter(d => d.year <= baselineYear);
                if (yearsBeforeOrAt.length > 0) {
                    baselineValue = yearsBeforeOrAt[yearsBeforeOrAt.length - 1][metricName];
                } else {
                    // No data before baselineYear, use first available
                    baselineValue = metricData[0][metricName];
                }
            }
            
            // Fallback to first value if still null/undefined
            if (baselineValue === null || baselineValue === undefined) {
                baselineValue = metricData[0][metricName];
            }
            
            metricData.forEach(d => {
                const year = d.year;
                if (!dataByYear[year]) {
                    dataByYear[year] = { year };
                }
                
                const value = d[metricName];
                if (baselineValue !== 0 && baselineValue !== undefined && value !== undefined && value !== null) {
                    const percentChange = ((value - baselineValue) / Math.abs(baselineValue)) * 100;
                    dataByYear[year][metricName] = percentChange;
                } else {
                    dataByYear[year][metricName] = 0;
                }
            });
        });
        
        // Convert to array and sort by year
        const result = Object.values(dataByYear).sort((a, b) => a.year - b.year);
        return result;
    }, [selectedMetrics, data, effectiveYearRange]);

    // Filter chartData based on effective year range
    const filteredChartData = useMemo(() => {
        if (chartData.length === 0) return [];
        return chartData.filter(d => d.year >= effectiveYearRange[0] && d.year <= effectiveYearRange[1]);
    }, [chartData, effectiveYearRange]);

    // Get all years from filtered chartData
    const years = useMemo(() => {
        if (filteredChartData.length === 0) return [];
        return filteredChartData.map(d => d.year).sort((a, b) => a - b);
    }, [filteredChartData]);
    
    // Get min/max % change across all selected metrics (from filtered data)
    const yDomain = useMemo(() => {
        if (filteredChartData.length === 0 || selectedMetrics.length === 0) return [0, 1];
        
        let minPercent = Infinity;
        let maxPercent = -Infinity;
        
        selectedMetrics.forEach(metricName => {
            const metricValues = filteredChartData
                .map(d => d[metricName] !== undefined ? d[metricName] : 0)
                .filter(v => v !== null && v !== undefined);
            
            if (metricValues.length > 0) {
                const metricMin = Math.min(...metricValues);
                const metricMax = Math.max(...metricValues);
                minPercent = Math.min(minPercent, metricMin);
                maxPercent = Math.max(maxPercent, metricMax);
            }
        });
        
        // Handle case where no valid data was found
        if (minPercent === Infinity) {
            return [0, 1];
        }
        
        // Add 10% padding
        const range = maxPercent - minPercent;
        const padding = range * 0.1;
        
        if (range === 0) {
            return [-1, 1];
        }
        
        return [minPercent - padding, maxPercent + padding];
    }, [filteredChartData, selectedMetrics]);
    
    // X and Y scales
    const xScale = useMemo(() => {
        if (years.length === 0) {
            return d3.scaleLinear().domain([1960, 2024]).range([0, boundsWidth]);
        }
        return d3.scaleLinear()
            .domain(d3.extent(years))
            .range([0, boundsWidth]);
    }, [years, boundsWidth]);
    
    const yScale = useMemo(() => {
        return d3.scaleLinear()
            .domain(yDomain)
            .range([boundsHeight, 0]);
    }, [yDomain, boundsHeight]);
    
    // Line generator
    const lineBuilder = useMemo(() => {
        return d3.line()
            .x(d => xScale(d.year))
            .y(d => yScale(d.value))
            .defined(d => d.value !== null && d.value !== undefined);
    }, [xScale, yScale]);
    
    // Get line data for each selected metric (from filtered data)
    const metricLineData = useMemo(() => {
        if (filteredChartData.length === 0) return {};
        
        const result = {};
        selectedMetrics.forEach(metricName => {
            const lineData = filteredChartData
                .map(d => ({ year: d.year, value: d[metricName] !== undefined ? d[metricName] : null }))
                .filter(d => d.value !== null);
            if (lineData.length >= 2) {
                result[metricName] = lineData;
            }
        });
        return result;
    }, [filteredChartData, selectedMetrics]);
    
    // Format function for y-axis
    const formatPercent = useCallback((value) => {
        return `${value.toFixed(0)}%`;
    }, []);

    // Format function for metric values
    const formatValue = useCallback((value) => {
        if (value === null || value === undefined) return 'N/A';
        const abs = Math.abs(value);
        if (abs >= 1000000000000) return `${(value / 1000000000000).toFixed(abs % 1000000000000 === 0 ? 0 : 1)}T`;
        if (abs >= 1000000000) return `${(value / 1000000000).toFixed(abs % 1000000000 === 0 ? 0 : 1)}B`;
        if (abs >= 1000000) return `${(value / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
        if (abs >= 1000) return `${(value / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
        if (abs >= 1) return value.toFixed(2);
        if (abs >= 0.01) return value.toFixed(3);
        return value.toFixed(4);
    }, []);

    // Mouse move handler for tooltip
    const handleMouseMove = useCallback((e) => {
        if (!xScale || filteredChartData.length === 0 || selectedMetrics.length === 0) {
            setTooltipData(null);
            return;
        }

        const svgRect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left - MARGIN.left;
        
        // Clamp mouseX to bounds
        if (mouseX < 0 || mouseX > boundsWidth) {
            setTooltipData(null);
            return;
        }

        // Find closest year
        const yearValue = xScale.invert(mouseX);
        const allYears = [...new Set(filteredChartData.map(d => d.year))].sort((a, b) => a - b);
        const closestYear = allYears.reduce((a, b) => 
            Math.abs(a - yearValue) < Math.abs(b - yearValue) ? a : b
        );

        // Get data for this year
        const yearData = filteredChartData.find(d => d.year === closestYear);
        if (!yearData) {
            setTooltipData(null);
            return;
        }

        // Use slider's baseline year for "% change since" label
        const startingYear = effectiveYearRange[0];

        // Build metrics list with color info
        const metricsList = selectedMetrics
            .filter(m => yearData[m] !== undefined && yearData[m] !== null)
            .map(m => ({
                name: formatMetricName(m),
                value: (yearData[m] >= 0 ? '+' : '') + yearData[m].toFixed(1) + '%',
                color: getMetricColor(m)
            }));

        if (metricsList.length === 0) {
            setTooltipData(null);
            return;
        }

        // Calculate tooltip dimensions (fixed width for consistent positioning)
        const tooltipWidth = 300;  // Fixed width regardless of metric count
        const tooltipHeight = 40 + metricsList.length * 20; // Header + subheader + each metric line

        // X-position: adapt based on cursor position
        let xPos;
        if (mouseX < boundsWidth / 2) {
            // Cursor on left side: align tooltip left edge slightly right of cursor
            xPos = e.clientX - svgRect.left*0.95;
        } else {
            // Cursor on right side: align tooltip right edge slightly left of cursor
            xPos = e.clientX - svgRect.left*0.9 - tooltipWidth*1.1;
        }

        // Y-position: center tooltip on cursor
        const yPos = e.clientY - svgRect.top - tooltipHeight / 2;

        setTooltipData({
            xPos: xPos,
            yPos: yPos,
            year: closestYear,
            startingYear: startingYear,
            metrics: metricsList
        });
        setHoveredYear(closestYear);
    }, [xScale, boundsWidth, filteredChartData, selectedMetrics, formatValue, getMetricColor, MARGIN]);

    // Mouse leave handler
    const handleMouseLeave = useCallback(() => {
        setTooltipData(null);
        setHoveredYear(null);
    }, []);
    
    // Calculate label positions for metric names at end of lines
    // All labels aligned on the right side of the chart
    const metricLabelPositions = useMemo(() => {
        const positions = {};
        const usedLabelBoxes = []; // Store {y, height} for vertical collision detection
        const labelX = boundsWidth - 10; // Fixed x-position on the far right
        const labelWidth = chartWidth * 0.25;
        const labelHeight = itemFontSize * 4;
        const buffer = 8;
        
        Object.entries(metricLineData).forEach(([metricName, lineData]) => {
            if (lineData.length === 0) return;
            
            const lastPoint = lineData[lineData.length - 1];
            const y = yScale(lastPoint.value);
            
            // All labels share the same x-position
            let finalY = y;
            let verticalOffset = 0;
            let hasCollision = true;
            let attempts = 0;
            
            while (hasCollision && attempts < 20) {
                hasCollision = false;
                let targetY = finalY;
                
                for (const box of usedLabelBoxes) {
                    // Check vertical overlap only (x is fixed)
                    const yOverlap = targetY < box.y + box.height + buffer &&
                                   targetY + labelHeight + buffer > box.y;
                    
                    if (yOverlap) {
                        hasCollision = true;
                        // Move directly to non-colliding position
                        if (targetY < box.y) {
                            targetY = box.y + box.height + buffer;  // Below existing box
                        } else {
                            targetY = box.y - labelHeight - buffer;  // Above existing box
                        }
                    }
                }
                
                if (hasCollision) {
                    finalY = targetY;
                }
                attempts++;
            }
            
            usedLabelBoxes.push({ y: finalY, height: labelHeight });
            positions[metricName] = { x: labelX, y: finalY };
        });
        
        return positions;
    }, [metricLineData, boundsWidth, yScale]);
    
    return (
        <>
            <div ref={containerRef} className="flex flex-col md:flex-row relative gap-6" style={{ width, height: chartContainerHeight, fontFamily: FONT_FAMILY, alignItems: 'flex-start', overflow: 'hidden' }}>
            {/* Collapse/Expand Button */}
            {!isMobileLayout && (
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute w-8 h-8 bg-blue-500 hover:bg-blue-600 rounded-md shadow border border-blue-600 flex items-center justify-center transition-colors z-20 text-white"
                    style={{
                        right: isPaneCollapsedState ? 0 : width - chartWidth*1.03,
                        top: 16,
                        fontSize: 30
                    }}
                    title={isPaneCollapsedState ? 'Expand pane' : 'Collapse pane'}
                >
                    {isPaneCollapsedState ? '←' : '→'}
                </button>
            )}
            
            {/* Chart Container */}
            <div className="relative" style={{ width: chartWidth, height: chartContainerHeight }}>
                {/* Chart */}
                <svg
                    width={chartWidth}
                    height={chartHeight}
                    style={{ display: 'block' }}
                    overflow="visible"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    <g transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}>
                        {/* Title */}
                        {selectedMetrics.length > 0 && (
                            <>
                                <text
                                    x={boundsWidth / 2}
                                    y={-MARGIN.top / 2}
                                    fontSize={titleFontSize}
                                    textAnchor="middle"
                                    fill="#333"
                                    fontWeight="bold"
                                >
                                    Multi line chart for decoupling analysis
                                </text>
                                <text
                                    x={boundsWidth / 2}
                                    y={-MARGIN.top / 2 + titleFontSize + 4}
                                    fontSize={Math.max(12, width * 0.018)}
                                    textAnchor="middle"
                                    fill="#666"
                                >
                                    % change in selected metrics since: {yearRange ? Math.round(yearRange[0]) : '...'}, Switzerland
                                </text>
                            </>
                        )}
                        
                        {/* Lines for each selected metric */}
                        {selectedMetrics.map(metricName => {
                            const lineData = metricLineData[metricName];
                            if (!lineData || lineData.length < 2) return null;
                            const color = getMetricColor(metricName);
                            const labelPos = metricLabelPositions[metricName];
                            const lastPoint = lineData[lineData.length - 1];
                            
                            return (
                                <g key={metricName}>
                                    <path
                                        d={lineBuilder(lineData)}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={2}
                                        strokeOpacity={hoveredMetric === null ? 1 : (hoveredMetric === metricName ? 1 : 0.2)}
                                    />
                                    {/* Year points as circles */}
                                    {lineData.map((point, i) => (
                                        <circle
                                            key={`point-${metricName}-${i}`}
                                            cx={xScale(point.year)}
                                            cy={yScale(point.value)}
                                            r={Math.max(2, width * 0.002)}
                                            fill={color}
                                            fillOpacity={hoveredMetric === null ? 0.7 : (hoveredMetric === metricName ? 0.7 : 0.2)}
                                            stroke="none"
                                            strokeWidth={1.5}
                                        />
                                    ))}
                                    {labelPos && (
                                        <>
                                            {/* Connecting line from end of line to label (aligned on right) */}
                                            <line
                                                x1={xScale(lastPoint.year)}
                                                y1={yScale(lastPoint.value)}
                                                x2={labelPos.x*1.05}
                                                y2={labelPos.y + (itemFontSize * 4)/2}  // Vertical center of foreignObject
                                                stroke={color}
                                                strokeWidth={1}
                                                strokeDasharray="3,2"
                                                strokeOpacity={hoveredMetric === null ? 1 : (hoveredMetric === metricName ? 1 : 0.2)}
                                            />
                                            <foreignObject 
                                                x={labelPos.x*1.06} 
                                                y={labelPos.y}
                                                width={chartWidth * 0.25}
                                                height={itemFontSize * 4}
                                            >
                                                <div 
                                                    style={{
                                                        fontSize: Math.max(10, width * 0.013),
                                                        color: color,
                                                        wordBreak: 'break-word',
                                                        textAlign: 'left',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        height: '100%',
                                                        cursor: 'pointer',
                                                        opacity: hoveredMetric === null ? 1 : (hoveredMetric === metricName ? 1 : 0.2)
                                                    }}
                                                    onMouseEnter={() => setHoveredMetric(metricName)}
                                                    onMouseLeave={() => setHoveredMetric(null)}
                                                >
                                                    {formatMetricName(metricName)}
                                                </div>
                                            </foreignObject>
                                        </>
                                    )}
                                </g>
                            );
                        })}
                        
                        {/* Vertical hover line */}
                        {hoveredYear !== null && filteredChartData.some(d => d.year === hoveredYear) && (
                            <line
                                x1={xScale(hoveredYear)}
                                y1={0}
                                x2={xScale(hoveredYear)}
                                y2={boundsHeight}
                                stroke="#999"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                                style={{ pointerEvents: 'none' }}
                            />
                        )}

                        {/* Hover circles on each metric line */}
                        {hoveredYear !== null && selectedMetrics.map(metricName => {
                            const lineData = metricLineData[metricName];
                            if (!lineData || lineData.length === 0) return null;
                            const yearPoint = lineData.find(d => d.year === hoveredYear);
                            if (!yearPoint) return null;
                            return (
                                <circle
                                    key={`hover-circle-${metricName}`}
                                    cx={xScale(hoveredYear)}
                                    cy={yScale(yearPoint.value)}
                                    r={Math.max(4, width * 0.006)}
                                    fill={getMetricColor(metricName)}
                                    fillOpacity={hoveredMetric === null ? 0.9 : (hoveredMetric === metricName ? 0.9 : 0.2)}
                                    stroke="white"
                                    strokeWidth={2}
                                    style={{ pointerEvents: 'none' }}
                                />
                            );
                        })}

                        {/* Axes */}
                        <AxisBottom 
                            xScale={xScale} 
                            pixelsPerTick={100} 
                            boundsHeight={boundsHeight} 
                            label="Year"
                            showVerticalGrid={false}
                            tickFormat={(d) => d}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                        />
                        <AxisLeft 
                            yScale={yScale} 
                            pixelsPerTick={60} 
                            boundsWidth={boundsWidth} 
                            label="% Change from First Year"
                            tickFormat={formatPercent}
                            labelFontSize={axisLabelFontSize}
                            tickFontSize={tickFontSize}
                        />
                    </g>
                </svg>
                
                {/* Custom Tooltip for multi-metric hover */}
                {tooltipData && (
                    <div
                        className="tooltip"
                        style={{
                            left: tooltipData.xPos,
                            top: tooltipData.yPos,
                            position: 'absolute',
                            pointerEvents: 'none',
                            zIndex: 1000,
                            fontFamily: FONT_FAMILY,
                            fontSize: tooltipFontSize,
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            whiteSpace: 'normal',
                            color: '#333',
                        }}
                    >
                        <div style={{ backgroundColor: '#f0f0f0', padding: '2px 6px' }}>
                            {tooltipData.year}
                            <div style={{ fontSize: tooltipFontSize * 0.9, color: '#666', marginTop: '1px' }}>
                                % change since {yearRange ? Math.round(yearRange[0]) : '...'}
                            </div>
                        </div>
                        {tooltipData.metrics.map((metric, idx) => (
                            <div key={idx} style={{ backgroundColor: 'white', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    backgroundColor: metric.color,
                                    border: '1px solid #333',
                                    flexShrink: 0
                                }} />
                                <span style={{ color: '#333' }}>{metric.name}: {metric.value}</span>
                            </div>
                        ))}
                    </div>
                )}
                
            </div>
          
            {/* Side Pane */}
        {!isPaneCollapsedState && (
                <div 
                    className={`border-l border-gray-200 bg-[#f5f5f5] p-4 rounded-lg shadow-sm ${isMobileLayout ? 'w-full pl-4 order-first overflow-y-auto overflow-x-hidden' : 'pl-3 overflow-y-auto overflow-x-hidden'}`}
                    style={{
                        flex: isMobileLayout ? 'auto' : '1',
                        height: isMobileLayout ? 'auto' : chartContainerHeight,
                        maxHeight: chartContainerHeight,
                        transition: 'width 0.2s ease',
                        zIndex: 1  
                    }}
                >
                    <div className="mb-4 text-sm font-semibold text-gray-700" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize*1 }}>
                        Add/remove metrics from the metric list at the bottom
                    </div>
                    {/* SECTION 1: Selection (N) with selected metrics list */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-semibold text-gray-700" style={{ fontSize: itemFontSize }}>
                                Selection ({selectedMetrics.length})
                            </span>
                            <button
                                onClick={clearAllSelections}
                                className="px-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize*0.9 }}
                            >
                                Clear selection
                            </button>
                        </div>
                        <div className="border border-gray-200 rounded-md bg-white overflow-y-auto">
                            {selectedMetrics.length > 0 ? (
                                <div className="p-2">
                                    {selectedMetrics
                                        .map(metricName => {
                                            const regResult = regressionResults.find(r => r.target_metric === metricName && r.predictor_type === selectedPredictorType);
                                            const color = getMetricColor(metricName);
                                            return (
                                                <label key={metricName} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isMetricSelected(metricName)}
                                                        onChange={() => toggleMetric(metricName)}
                                                        className="h-4 w-4 rounded border-2"
                                                        style={{
                                                            borderColor: color,
                                                            accentColor: color,
                                                            backgroundColor: isMetricSelected(metricName) ? color : 'white'
                                                        }}
                                                    />
                                                    <span className="text-sm break-words font-medium" style={{
                                                        fontSize: itemFontSize,
                                                        fontWeight: isMetricSelected(metricName) ? 'bold' : 'normal'
                                                    }}>
                                                        {formatMetricName(metricName)}
                                                    </span>
                                                    {regResult && (
                                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                                            {regResult.best_model === 'linear' ? 'Lin' : 
                                                             regResult.best_model === 'logarithmic' ? 'Log' :
                                                             regResult.best_model === 'michaelis_menten' ? 'MM' :
                                                             regResult.best_model === 'exp_saturating' ? 'Sat' :
                                                             regResult.best_model === 'constant' ? 'Cst' : '?'}
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="p-2 text-sm text-gray-500" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}>
                                    No metrics selected
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* SECTION 2: Filters and Sort */}
                    <div className="mb-6 space-y-4">
                        {/* Search Bar */}
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            <SearchBar
                                value={searchQuery}
                                onChange={setSearchQuery}
                                placeholder="Search for a metric"
                                style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize, paddingLeft: '2.5rem' }}
                            />
                        </div>
                        
                        {/* Filter by Model Type Dropdown */}
                        <div className="relative model-dropdown">
                            <button
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex justify-between items-center bg-white"
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
                                            if (selectedModelTypes.length === ALL_MODEL_TYPES_CONST.length) {
                                                setSelectedModelTypes([]);
                                            } else {
                                                setSelectedModelTypes([...ALL_MODEL_TYPES_CONST]);
                                            }
                                        }}
                                        className="w-full text-left px-3 py-1 hover:bg-gray-50 cursor-pointer sticky top-0 bg-white border-b border-gray-200 flex items-center"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedModelTypes.length === ALL_MODEL_TYPES_CONST.length && ALL_MODEL_TYPES_CONST.length > 0}
                                            readOnly
                                            className="mr-2 h-4 w-4 pointer-events-none bg-white"
                                        />
                                        <span className="text-sm font-semibold">Select All</span>
                                    </button>
                                    {ALL_MODEL_TYPES_CONST.map(modelType => (
                                        <label key={modelType} className="flex items-center px-3 py-1 hover:bg-gray-50 cursor-pointer" onClick={(e) => e.stopPropagation()} style={{ fontSize: itemFontSize }}>
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
                                                className="mr-2 h-4 w-4 bg-white"
                                            />
                                            <span className="text-sm">{modelType} ({modelTypeCounts[modelType] || 0})</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Filter by Category Dropdown */}
                        <div className="relative category-dropdown">
                            <button
                                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex justify-between items-center bg-white"
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
                                            className="mr-2 h-4 w-4 pointer-events-none bg-white"
                                        />
                                        <span className="text-sm font-semibold">Select All</span>
                                    </button>
                                    {allCategories.map(cat => (
                                        <label key={cat} className="flex items-center px-3 py-1 hover:bg-gray-50 cursor-pointer" onClick={(e) => e.stopPropagation()} style={{ fontSize: itemFontSize }}>
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
                                                className="mr-2 h-4 w-4 bg-white"
                                            />
                                            <span className="text-sm">{cat} ({categoryCounts[cat] || 0})</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Sort Dropdown */}
                        <div>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}
                            >
                                {SORT_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <hr className="mb-4 border-t-4 border-gray-300" /> 

                    {/* SECTION 3: Full Metric List with Checkboxes */}
                    <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}>
                            All Metrics ({filteredSeriesKeys.length})
                        </div>
                        <div 
                            ref={metricListRef}
                            className="space-y-1 flex-1 max-h-full  overflow-y-auto"
                        >
                            {filteredSeriesKeys.map((key, index) => {
                                const isSelected = isMetricSelected(key);
                                const regResult = regressionResults.find(r => r.target_metric === key && r.predictor_type === selectedPredictorType);
                                
                                return (
                                    <label key={key} className="flex items-center gap-2 p-1 rounded cursor-pointer transition-colors hover:bg-gray-100" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleMetric(key)}
                                            className="h-4 w-4 rounded border-2 border-gray-400"
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
                                    </label>
                                );
                            })}
                        </div>
                        
                        {filteredSeriesKeys.length === 0 && (
                            <div className="text-center text-sm text-gray-500 py-4" style={{ fontFamily: FONT_FAMILY, fontSize: itemFontSize }}>
                                No metrics match your search
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div> {/* THIS CLOSING DIV IS THE CLOSING DIV OF THE FLEX CONTAINER */} 

        {/* Year Range Slider */}
        <div className="pt-1 pb-4 mt-0 px-2 flex items-center gap-4 rounded-lg shadow-sm w-full">
            <Slider
                value={yearRange || fullYearRange}
                min={fullYearRange[0]}
                max={fullYearRange[1]}
                onChange={setYearRange}
                label="Year range"
                unit=""
            />
            <button
                onClick={() => setYearRange(fullYearRange)}
                className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
                Reset range
            </button>
        </div> {/* THIS DIV IS THE CLOSING DIV OF THE YEAR RANGE SLIDER */} 

        </>
    );
};

/**
 * Responsive wrapper that sizes to 100% of parent width
 */
export const ResponsiveMultiMetricLineChart = ({ height = 600, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);
    const finalWidth = chartSize?.width || 800;
    
    return (
        <div ref={chartRef} style={{ width: '100%' }}>
            <MultiMetricLineChart
                width={finalWidth}
                height={height}
                {...props}
            />
        </div>
    );
};

export default MultiMetricLineChart;
