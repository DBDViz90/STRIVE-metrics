/*--- Tracks the raise of renewables worldwide from 1965 to 2024 ---*/

import { useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { AxisLeft } from '../../Axes/AxisLeft.jsx';
import { AxisBottom } from '../../Axes/AxisBottom.jsx';
import { useDimensions } from '../../../../hooks/use-dimensions.js';


export const LineChart = ({ width, height, data }) => {
    /* --- constants --- */
    const PANE_WIDTH = 192; // w-48
    const GAP = 16; // gap-4

    /* --- margins --- */
    const MARGIN = { top: 50, right: 30, bottom: 60, left: 120 };

    /* --- chart dimensions --- */
    const chartWidth = width - PANE_WIDTH - GAP;
    const boundsWidth = chartWidth - MARGIN.left - MARGIN.right;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;
    const titleFontSize = Math.max(14, chartWidth * 0.025);

    /* --- series configuration --- */
    const seriesKeys = ["nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"];
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(seriesKeys);

    /* --- Visible series state --- */
    const [visibleSeries, setVisibleSeries] = useState(() => new Set(seriesKeys));

    /* --- data processing --- */
    const seriesData = useMemo(() => {
        return seriesKeys.map((key) => {
            return data.map((d) => ({
                year: d.year,
                value: d[key]
            }));
        });
    }, [data, seriesKeys]);

    /* --- scales --- */
    const [xMin, xMax] = useMemo(() => d3.extent(data, (d) => d.year), [data]);

    const maxY = useMemo(() => {
        return d3.max(seriesKeys, (key) => d3.max(data, (d) => d[key]));
    }, [data, seriesKeys]);

    const xScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([xMin || 0, xMax || 0])
            .range([0, boundsWidth]);
    }, [xMin, xMax, boundsWidth]);

    const yScale = useMemo(() => {
        return d3
            .scaleLinear()
            .domain([0, maxY || 0])
            .range([boundsHeight, 0]);
    }, [maxY, boundsHeight]);

    /* --- line generator --- */
    const lineBuilder = useMemo(() => {
        return d3
            .line()
            .x((d) => xScale(d.year))
            .y((d) => yScale(d.value));
    }, [xScale, yScale]);

    /* --- render paths --- */
    const visibleLines = useMemo(() => {
        return seriesData.map((serie, i) => {
            return visibleSeries.has(seriesKeys[i]) ? (
                <path
                    key={i}
                    d={lineBuilder(serie)}
                    fill="none"
                    stroke={colorScale(seriesKeys[i])}
                    strokeWidth={2}
                />
            ) : null;
        }).filter(Boolean);
    }, [seriesData, lineBuilder, colorScale, visibleSeries, seriesKeys]);

    /* --- Toggle series visibility --- */
    const toggleSeries = (key) => {
        setVisibleSeries(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key);
            else newSet.add(key);
            return newSet;
        });
    };

    return (
        <div className="flex gap-4" style={{ height }}>
            <div className="flex-1 min-w-0">
                <svg width={chartWidth} height={height}>
                    <text
                        x={chartWidth / 2}
                        y={MARGIN.top - 15}
                        fontSize={titleFontSize}
                        textAnchor="middle"
                    >
                        Raise of renewables worldwide [TWh]
                    </text>
                    <g
                        width={boundsWidth}
                        height={boundsHeight}
                        transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}
                    >
                        {visibleLines}
                        <AxisBottom xScale={xScale} pixelsPerTick={100} boundsHeight={boundsHeight} label="Year" showVerticalGrid={false} />
                        <AxisLeft yScale={yScale} pixelsPerTick={60} boundsWidth={boundsWidth} label="Energy [TWh]" />
                    </g>
                </svg>
            </div>
            <div className="w-48 bg-white p-4 rounded-lg shadow-lg space-y-2 shrink-0" style={{ height }}>
                {seriesKeys.map((key) => (
                    <div key={key} className="flex items-center gap-2">
                        <Checkbox
                            id={`series-${key}`}
                            checked={visibleSeries.has(key)}
                            onCheckedChange={() => toggleSeries(key)}
                        />
                        <label htmlFor={`series-${key}`} className="capitalize text-sm">
                            {key.replace('_', ' ')}
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );
};


/*--- responsive wrapper for LineChart ---*/

export const ResponsiveLineChart = ({ width = 500, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);

    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;

    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <LineChart
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};
