/*
 * PA_UNIL Swiss Metrics Dashboard
 * Visualizes Swiss social progress and economic data with regression analysis
 * Uses SingleMetricExplorer for single-metric-at-a-time visualization
 */

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveScatterplotWithRegression } from './components/charts/ScatterplotWithRegression';
import { ResponsiveLineChartWithMetrics } from './components/charts/LineChartWithMetrics';
import { ResponsiveMultiMetricLineChart } from './components/charts/MultiMetricLineChart';
import { loadSwissMetrics, loadRegressionResults, loadMetricsByCategory, loadMetadata } from './lib/data-loader';
import { Slider } from './components/custom_ui/Slider';

// Custom color scale for different categories
import * as d3 from 'd3';

export default function App() {
    const [analysisMode, setAnalysisMode] = useState('single'); // 'single' or 'multi'
    const [chartType, setChartType] = useState('scatter'); // 'scatter' or 'line'
    // Shared right pane state
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('alphabetical');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedModelTypes, setSelectedModelTypes] = useState([]);
    const [selectedPredictorType, setSelectedPredictorType] = useState('CHF_LCU');
    const [metadata, setMetadata] = useState([]);
    // GDP range slider state for scatter plot
    const [xDomain, setXDomain] = useState(null);
    // Year range slider state for line chart
    const [yearDomain, setYearDomain] = useState([1960, 2024]);
    
    const [metricsData, setMetricsData] = useState({ data: [], seriesKeys: [] });
    const [regressionResults, setRegressionResults] = useState([]);
    const [categories, setCategories] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Calculate GDP range for scatter plot slider
    const gdpRange = useMemo(() => {
        if (metricsData.data.length === 0) return [0, 100];
        const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
        const allX = metricsData.data.map(d => d[gdpKey]).filter(x => x !== null && x !== undefined);
        if (allX.length === 0) return [0, 100];
        const [minX, maxX] = d3.extent(allX);
        return [minX || 0, maxX || 100];
    }, [metricsData.data, selectedPredictorType]);

    // Calculate year range for line chart slider
    const yearRange = useMemo(() => {
        if (metricsData.data.length === 0) return [1960, 2024];
        const allYears = metricsData.data.map(d => d.year).filter(y => y !== null && y !== undefined);
        if (allYears.length === 0) return [1960, 2024];
        const [minY, maxY] = d3.extent(allYears);
        return [minY || 1960, maxY || 2024];
    }, [metricsData.data]);

    // Auto-update xDomain when metric or predictor changes (only for scatter chart)
    useEffect(() => {
        if (chartType === 'scatter' && analysisMode === 'single') {
            if (selectedMetric) {
                const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
                const metricData = metricsData.data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                const metricX = metricData.map(d => d[gdpKey]).filter(x => x != null);
                if (metricX.length > 0) {
                    setXDomain(d3.extent(metricX));
                } else {
                    setXDomain(gdpRange);
                }
            } else {
                setXDomain(gdpRange);
            }
        }
    }, [chartType, selectedMetric, metricsData.data, gdpRange, selectedPredictorType, analysisMode]);

    // Auto-update yearDomain for line chart when metric changes
    useEffect(() => {
        if (chartType === 'line' && analysisMode === 'single') {
            if (yearDomain === null || yearDomain[0] === undefined || yearDomain[1] === undefined || yearDomain.length !== 2) {
                // Initialize to full data range, clamped to [1960, 2024]
                const allYears = metricsData.data.map(d => d.year).filter(y => y !== null && y !== undefined);
                if (allYears.length > 0) {
                    const [minY, maxY] = d3.extent(allYears);
                    setYearDomain([
                        Math.max(1960, minY || 1960),
                        Math.min(2024, maxY || 2024)
                    ]);
                } else {
                    setYearDomain([1960, 2024]);
                }
            }
            if (selectedMetric) {
                const metricData = metricsData.data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                const metricYears = metricData.map(d => d.year).filter(y => y != null);
                if (metricYears.length > 0) {
                    const [minY, maxY] = d3.extent(metricYears);
                    setYearDomain([
                        Math.max(1960, minY || 1960),
                        Math.min(2024, maxY || 2024)
                    ]);
                    return;
                }
            }
            if (yearDomain === null || yearDomain[0] === undefined || yearDomain[1] === undefined || yearDomain.length !== 2) {
                setYearDomain([1960, 2024]);
            }
        }
    }, [chartType, selectedMetric, metricsData.data, analysisMode]);

    // Load all data on mount
    useEffect(() => {
        async function loadAllData() {
            try {
                setIsLoading(true);
                
                // Load base data
                const swissMetrics = await loadSwissMetrics();
                const regression = await loadRegressionResults();
                const cats = await loadMetricsByCategory();
                const meta = await loadMetadata();
                
                setMetricsData(swissMetrics);
                setRegressionResults(regression);
                setCategories(cats);
                setMetadata(meta);
                
                // Initialize filters
                const allCategories = [...new Set(meta.map(m => m.category).filter(c => c))];
                setSelectedCategories(allCategories);
                setSelectedModelTypes(['Constant', 'Undefined', '↑ Linear', '↓ Linear', '↑ Saturating', '↓ Saturating']);
                
                // Initialize year domain for line chart
                const allYears = swissMetrics.data.map(d => d.year).filter(y => y !== null && y !== undefined);
                if (allYears.length > 0) {
                    setYearDomain(d3.extent(allYears));
                }
                
                setError(null);
            } catch (err) {
                setError(err.message);
                console.error('Failed to load data:', err);
            } finally {
                setIsLoading(false);
            }
        }
        
        loadAllData();
    }, []);



    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading Swiss metrics data...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
                <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
                    <h2 className="text-xl font-bold text-red-500 mb-4">Error Loading Data</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50" style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="w-[60vw] mx-auto px-4 sm:px-6 lg:px-8"> 
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <h1 className="text-xl font-bold text-gray-900">PA_UNIL STRIVE metric tool</h1>
                        </div>
                        <div className="text-md text-gray-500">
                            🇨🇭 Switzerland data between 1960 and 2024
                        </div>
                    </div>
                </div>
            </header>

            {/* Analysis Mode Toggle */}
            <div className="w-[60vw] mx-auto px-4 sm:px-6 lg:px-8 py-2"> 
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
                    <button
                        onClick={() => setAnalysisMode('single')}
                        className={`px-4 py-2 text-md font-medium rounded transition-colors ${
                            analysisMode === 'single' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Single-metric regression for trend analysis
                    </button>
                    <button
                        onClick={() => setAnalysisMode('multi')}
                        className={`px-4 py-2 text-md font-medium rounded transition-colors ${
                            analysisMode === 'multi' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Multi-metric decoupling analysis
                    </button>
                </div>
            </div>

            {/* Chart Type Toggle - Only shown in single mode */}
            {analysisMode === 'single' && (
                <div className="w-[60vw] mx-auto px-4 sm:px-6 lg:px-8 py-2"> 
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
                        <button
                            onClick={() => setChartType('scatter')}
                        className={`px-4 py-2 text-md font-medium rounded transition-colors ${
                            chartType === 'scatter' 
                                ? 'bg-cyan-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Scatter plot regression (Metric vs GDP)
                    </button>
                    <button
                        onClick={() => setChartType('line')}
                        className={`px-4 py-2 text-md font-medium rounded transition-colors ${
                            chartType === 'line' 
                                ? 'bg-cyan-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Line chart (Metric yearly value)
                    </button>
                </div>
            </div>
            )}

            {/* Main Content */}
            <main className="w-[60vw] mx-auto px-4 sm:px-6 lg:px-8 py-0"> 
                {analysisMode === 'multi' ? (
                    /* Multi-Metric Analysis View */
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 -mr-18">
                        <ResponsiveMultiMetricLineChart
                            data={metricsData.data}
                            seriesKeys={metricsData.seriesKeys}
                            regressionResults={regressionResults}
                            metadata={metadata}
                        />
                    </div>
                ) : (
                    /* Single Metric Analysis View */
                    <>
                        {/* Chart */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 -mr-18" >
                            {chartType === 'scatter' ? (
                                <ResponsiveScatterplotWithRegression
                            data={metricsData.data}
                            seriesKeys={metricsData.seriesKeys}
                            regressionResults={regressionResults}
                            metadata={metadata}
                            selectedMetric={selectedMetric}
                            onSelectMetric={setSelectedMetric}
                            onSwitchToLineChart={() => setChartType('line')}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            sortBy={sortBy}
                            onSortChange={setSortBy}
                            selectedCategories={selectedCategories}
                            onCategoriesChange={setSelectedCategories}
                            selectedModelTypes={selectedModelTypes}
                            onModelTypesChange={setSelectedModelTypes}
                            selectedPredictorType={selectedPredictorType}
                            onPredictorChange={setSelectedPredictorType}
                            xDomain={xDomain}
                            onXDomainChange={setXDomain}
                            gdpRange={gdpRange}
                            xAxisLabel="GDP per capita ($USD)"
                            title="Swiss Metrics Explorer"
                        />
                    ) : (
                                <ResponsiveLineChartWithMetrics
                            data={metricsData.data}
                            seriesKeys={metricsData.seriesKeys}
                            regressionResults={regressionResults}
                            metadata={metadata}
                            selectedMetric={selectedMetric}
                            onSelectMetric={setSelectedMetric}
                            onSwitchToLineChart={() => {}} // No-op for line chart
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            sortBy={sortBy}
                            onSortChange={setSortBy}
                            selectedCategories={selectedCategories}
                            onCategoriesChange={setSelectedCategories}
                            selectedModelTypes={selectedModelTypes}
                            onModelTypesChange={setSelectedModelTypes}
                            selectedPredictorType={selectedPredictorType}
                            onPredictorChange={setSelectedPredictorType}
                            xAxisLabel="Year"
                            yAxisLabel="Metric Value"
                            title="Swiss Metrics Explorer"
                            yearDomain={yearDomain}
                            setYearDomain={setYearDomain}
                        />
                    )}
                </div>

                {/* GDP Range Slider for Scatter Plot */}
                {chartType === 'scatter' && (
                    <div className="mt-4 px-2 flex items-center gap-4 rounded-lg shadow-sm ">
                        <Slider
                            value={xDomain || gdpRange}
                            min={gdpRange[0]}
                            max={gdpRange[1]}
                            onChange={setXDomain}
                            label="GDP per capita range"
                            unit={selectedPredictorType === 'CHF_LCU' ? 'CHF' : '$USD'}
                        />
                        <button
                            onClick={() => {
                                const gdpKey = selectedPredictorType === 'CHF_LCU' ? 'gdp_lcu' : 'gdp_usd';
                                if (selectedMetric) {
                                    const metricData = metricsData.data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                                    const metricX = metricData.map(d => d[gdpKey]).filter(x => x != null);
                                    if (metricX.length > 0) {
                                        setXDomain(d3.extent(metricX));
                                        return;
                                    }
                                    setXDomain(gdpRange);
                                } else {
                                    setXDomain(gdpRange);
                                }
                            }}
                            className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors whitespace-nowrap"
                        >
                            Reset range
                        </button>
                    </div>
                )}

                {/* Year Range Slider for Line Chart */}
                {chartType === 'line' && (
                    <div className="mt-4 px-2 flex items-center gap-4 rounded-lg shadow-sm ">
                        <Slider
                            value={yearDomain || yearRange}
                            min={yearRange[0]}
                            max={yearRange[1]}
                            onChange={setYearDomain}
                            label="Year range"
                            unit=""
                        />
                        <button
                            onClick={() => {
                                if (selectedMetric) {
                                    const metricData = metricsData.data.filter(d => d[selectedMetric] !== null && d[selectedMetric] !== undefined);
                                    const metricYears = metricData.map(d => d.year).filter(y => y != null);
                                    if (metricYears.length > 0) {
                                        setYearDomain(d3.extent(metricYears));
                                        return;
                                    }
                                }
                                setYearDomain(yearRange);
                            }}
                            className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 transition-colors whitespace-nowrap"
                        >
                            Reset range
                        </button>
                    </div>
                )}

                {/* Info Panel */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-800 mb-2">User tips</h3>
                    <div className="text-sm text-blue-700">
                        <ul className="list-disc list-inside">
                            <li> Right pane
                                <ul className="list-disc list-inside pl-6">
                                    <li>2 GDP predictor metrics can be selected through the second button in the right pane : GDP in constant CHF (LCU) and GDP in current USD</li>
                                    <li>Clicking one of the 2 GDPs metrics at the top of the list displays the corresponding line chart</li>
                                    <li>The scrolling metric list can be filtered by model type, and also by increasing or decreasing regression </li>
                                    <li>Can also filter by categories. For now those categories come from the databases metadata </li>
                                    <li>Can sort the metric list order by alphabetical order, by the number of datapoints, or by the R^2 value </li>
                                </ul>
                            </li>
                            <li> For the scatter plot
                                <ul className="list-disc list-inside pl-6">
                                    <li>Hovering shows connected lines between data points, going from the earliest year to the latest year, in order</li>
                                    <li>Hovering also shows a tooltip displaying the corresponding year, the metric (y-axis) value, and the GDP (x axis) value</li>
                                </ul>
                            </li>
                            
                        </ul>
                    </div>
                </div>

                    </>
                )}

            </main>
        </div>
    );
}
