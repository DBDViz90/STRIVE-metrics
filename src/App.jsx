/*
 * PA_UNIL Swiss Metrics Dashboard
 * Visualizes Swiss social progress and economic data with regression analysis
 * Uses SingleMetricExplorer for single-metric-at-a-time visualization
 */

import { useState, useEffect } from 'react';
import { ResponsiveScatterplotWithRegression } from './components/charts/ScatterplotWithRegression';
import { ResponsiveLineChartWithMetrics } from './components/charts/LineChartWithMetrics';
import { loadSwissMetrics, loadRegressionResults, loadMetricsByCategory, loadMetadata } from './lib/data-loader';

// Custom color scale for different categories
import * as d3 from 'd3';

export default function App() {
    const [chartType, setChartType] = useState('scatter'); // 'scatter' or 'line'
    // Shared right pane state
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('alphabetical');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [selectedModelTypes, setSelectedModelTypes] = useState([]);
    const [selectedPredictorType, setSelectedPredictorType] = useState('CHF_LCU');
    const [paneWidth, setPaneWidth] = useState(200);
    const [metadata, setMetadata] = useState([]);
    
    const [metricsData, setMetricsData] = useState({ data: [], seriesKeys: [] });
    const [regressionResults, setRegressionResults] = useState([]);
    const [categories, setCategories] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <h1 className="text-xl font-bold text-gray-900">PA_UNIL STRIVE metric tool</h1>
                            <span className="ml-3 text-sm text-gray-500">Regression analyzer</span>
                        </div>
                        <div className="text-sm text-gray-500">
                            🇨🇭 Switzerland data between 1960 and 2024
                        </div>
                    </div>
                </div>
            </header>

            {/* Chart Type Toggle */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
                    <button
                        onClick={() => setChartType('scatter')}
                        className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                            chartType === 'scatter' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Scatter plot (Metric vs GDP)
                    </button>
                    <button
                        onClick={() => setChartType('line')}
                        className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                            chartType === 'line' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        Line chart (Metric yearly value)
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Chart */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    {chartType === 'scatter' ? (
                        <ResponsiveScatterplotWithRegression
                            data={metricsData.data}
                            seriesKeys={metricsData.seriesKeys}
                            regressionResults={regressionResults}
                            metadata={metadata}
                            selectedMetric={selectedMetric}
                            onSelectMetric={setSelectedMetric}
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
                            paneWidth={paneWidth}
                            onPaneWidthChange={setPaneWidth}
                            xAxisLabel="GDP per capita ($USD)"
                            yAxisLabel="Metric Value"
                            title="Swiss Metrics Explorer"
                            style={{ minHeight: '600px' }}
                        />
                    ) : (
                        <ResponsiveLineChartWithMetrics
                            data={metricsData.data}
                            seriesKeys={metricsData.seriesKeys}
                            regressionResults={regressionResults}
                            metadata={metadata}
                            selectedMetric={selectedMetric}
                            onSelectMetric={setSelectedMetric}
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
                            paneWidth={paneWidth}
                            onPaneWidthChange={setPaneWidth}
                            xAxisLabel="Year"
                            yAxisLabel="Metric Value"
                            title="Swiss Metrics Explorer"
                            style={{ minHeight: '600px' }}
                        />
                    )}
                </div>

                {/* Info Panel */}
                <div className="mt-20 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-800 mb-2">User tips</h3>
                    <p className="text-sm text-blue-700">
                        <ul className="list-disc list-inside">
                            <li> Right pane
                                <ul className="list-disc list-inside pl-6">
                                    <li>2 GDP predictor metrics can be selected in the right pane : GDP in current USD and GDP in constant CHF (LCU)</li>
                                    <li>Can filter by model type, and also by increasing or decreasing regression </li>
                                    <li>Can filter categories. For now those categories come from the databases metadata </li>
                                    <li>Can sort the metric list order by alphabetical order or by the number of datapoints </li>
                                </ul>
                            </li>
                            <li> For the scatter plot
                                <ul className="list-disc list-inside pl-6">
                                    <li>Hovering shows connected lines between data points, going from the earliest year to the latest year, in order</li>
                                    <li>Hovering also shows a tooltip of the metric (y axis) value, and the GDP (x axis) value</li>
                                </ul>
                            </li>
                            
                        </ul>
                    </p>
                </div>

            </main>
        </div>
    );
}
