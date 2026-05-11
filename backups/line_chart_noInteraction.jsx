/*--- Tracks the raise of renewables worldwide from 1965 to 2024 ---*/

import { useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { AxisLeft } from '../../Axes/AxisLeft.jsx';
import { AxisBottom } from '../../Axes/AxisBottom.jsx';
import { useDimensions } from '../../../../hooks/use-dimensions.js';


export const LineChart = ({ width, height, data }) => {
    /* --- margins --- */
    const MARGIN = { top: 50, right: 30, bottom: 60, left: 120 };

    /* --- bounds --- */
    const boundsWidth = width - MARGIN.left - MARGIN.right;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;

    /* --- Color Scale --- */
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(["coal", "oil", "gas", "nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"]);

    /* --- Data: extract series for line chart --- */
    const seriesKeys = ["coal", "oil", "gas", "nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"];

    /* --- scales --- */
    const [xMin, xMax] = useMemo(() => d3.extent(data, (d) => d.year), [data]);

    const maxY = useMemo(() => {
        return d3.max(seriesKeys, (key) => d3.max(data, (d) => d[key]));
    }, [data]);

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

    /* --- Line Generator --- */
    const lineBuilder = useMemo(() => {
        return d3
            .line()
            .x((d) => xScale(d.year))
            .y((d) => yScale(d.value));
    }, [xScale, yScale]);

    /* --- Prepare series data for line chart --- */
    const seriesData = useMemo(() => {
        return seriesKeys.map((key) => {
            return data.map((d) => ({
                year: d.year,
                value: d[key]
            }));
        });
    }, [data, seriesKeys]);

    /* --- SVG Paths --- */
    const allLines = useMemo(() => {
        return seriesData.map((serie, i) => {
            return (
                <path
                    key={i}
                    d={lineBuilder(serie)}
                    fill="none"
                    stroke={colorScale(seriesKeys[i])}
                    strokeWidth={2}
                />
            );
        });
    }, [seriesData, lineBuilder, colorScale]);

    return (
        <div>
            <svg width={width + MARGIN.left + MARGIN.right} height={height + MARGIN.top + MARGIN.bottom}>
                <text
                    x={(width + MARGIN.left + MARGIN.right) / 2}
                    y={MARGIN.top - 15}
                    fontSize={20}
                    textAnchor="middle"
                >
                    Raise of renewables worldwide [TWh]
                </text>
                <g
                    width={boundsWidth}
                    height={boundsHeight}
                    transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}
                >
                    {allLines}
                    <AxisBottom xScale={xScale} pixelsPerTick={100} boundsHeight={boundsHeight} label="Year" showVerticalGrid={false} />
                    <AxisLeft yScale={yScale} pixelsPerTick={100} boundsWidth={boundsWidth} label="Energy [TWh]" />
                </g>
            </svg>
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
