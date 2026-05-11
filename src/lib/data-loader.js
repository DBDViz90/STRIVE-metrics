/*
 * Data loader utility for loading JSON data files
 * Provides functions to fetch and transform data for the MetricExplorer
 */

const DATA_BASE = import.meta.env.BASE_URL + 'data';

/**
 * Load Swiss metrics data from JSON
 * Returns { data, seriesKeys, metadata } in format ready for MetricExplorer
 */
export async function loadSwissMetrics() {
    try {
        const response = await fetch(`${DATA_BASE}/swiss_metrics.json`);
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status}`);
        }
        const jsonData = await response.json();
        return {
            data: jsonData.data,
            seriesKeys: jsonData.seriesKeys
        };
    } catch (error) {
        console.error('Error loading Swiss metrics:', error);
        return { data: [], seriesKeys: [] };
    }
}

/**
 * Load metadata for all metrics
 */
export async function loadMetadata() {
    try {
        const response = await fetch(`${DATA_BASE}/metadata.json`);
        if (!response.ok) {
            throw new Error(`Failed to load metadata: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading metadata:', error);
        return [];
    }
}

/**
 * Load regression results
 */
export async function loadRegressionResults() {
    try {
        const response = await fetch(`${DATA_BASE}/regression_results.json`);
        if (!response.ok) {
            throw new Error(`Failed to load regression results: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading regression results:', error);
        return [];
    }
}

/**
 * Load metrics grouped by category
 */
export async function loadMetricsByCategory() {
    try {
        const response = await fetch(`${DATA_BASE}/metrics_by_category.json`);
        if (!response.ok) {
            throw new Error(`Failed to load categories: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading categories:', error);
        return {};
    }
}

/**
 * Filter metrics by best model type from regression results
 * @param {string} modelType - 'exp_saturating', 'logarithmic', 'michaelis_menten', 'linear', 'constant', 'other'
 */
export async function loadMetricsByModel(modelType) {
    const regressionResults = await loadRegressionResults();
    const swissData = await loadSwissMetrics();
    
    const matchingMetrics = regressionResults
        .filter(r => r.best_model === modelType)
        .map(r => r.metric_name);
    
    // Filter series keys to only those with matching regression
    const filteredSeriesKeys = swissData.seriesKeys.filter(key => 
        matchingMetrics.includes(key)
    );
    
    // Filter data to only include matching series
    const filteredData = swissData.data.map(d => {
        const filtered = { x: d.x };
        filteredSeriesKeys.forEach(key => {
            if (d[key] !== undefined) {
                filtered[key] = d[key];
            }
        });
        return filtered;
    });
    
    return {
        data: filteredData,
        seriesKeys: filteredSeriesKeys
    };
}

/**
 * Load metrics by category
 * @param {string} category - Category name to filter by
 */
export async function loadMetricsByCategoryName(category) {
    const categories = await loadMetricsByCategory();
    const swissData = await loadSwissMetrics();
    
    if (!categories[category]) {
        return { data: [], seriesKeys: [] };
    }
    
    const categoryMetrics = categories[category].map(m => m.full_name);
    const filteredSeriesKeys = swissData.seriesKeys.filter(key => 
        categoryMetrics.includes(key)
    );
    
    const filteredData = swissData.data.map(d => {
        const filtered = { x: d.x };
        filteredSeriesKeys.forEach(key => {
            if (d[key] !== undefined) {
                filtered[key] = d[key];
            }
        });
        return filtered;
    });
    
    return {
        data: filteredData,
        seriesKeys: filteredSeriesKeys
    };
}

/**
 * Search metrics by name
 * @param {string} query - Search query (case-insensitive)
 */
export async function searchMetrics(query) {
    const swissData = await loadSwissMetrics();
    
    const lowerQuery = query.toLowerCase();
    const filteredSeriesKeys = swissData.seriesKeys.filter(key => 
        key.toLowerCase().includes(lowerQuery)
    );
    
    const filteredData = swissData.data.map(d => {
        const filtered = { x: d.x };
        filteredSeriesKeys.forEach(key => {
            if (d[key] !== undefined) {
                filtered[key] = d[key];
            }
        });
        return filtered;
    });
    
    return {
        data: filteredData,
        seriesKeys: filteredSeriesKeys
    };
}

/**
 * Get top N metrics by latest value
 * @param {number} n - Number of top metrics to return
 */
export async function getTopMetrics(n = 20) {
    const { data, seriesKeys } = await loadSwissMetrics();
    
    if (data.length === 0) return { data: [], seriesKeys: [] };
    
    // Get last year's data
    const lastYear = data[data.length - 1];
    
    // Sort series by last value (descending)
    const sortedSeries = [...seriesKeys].sort((a, b) => {
        const valA = lastYear[a] || 0;
        const valB = lastYear[b] || 0;
        return valB - valA;
    }).slice(0, n);
    
    const filteredData = data.map(d => {
        const filtered = { x: d.x };
        sortedSeries.forEach(key => {
            if (d[key] !== undefined) {
                filtered[key] = d[key];
            }
        });
        return filtered;
    });
    
    return {
        data: filteredData,
        seriesKeys: sortedSeries
    };
}
