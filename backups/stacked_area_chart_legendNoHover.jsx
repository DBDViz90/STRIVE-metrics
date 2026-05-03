/* --- Global (world) energy mix in TWh over time from 1965 to 2024 --- */

import { useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { AxisBottom } from '../../Axes/AxisBottom.jsx';
import { AxisLeft } from '../../Axes/AxisLeft.jsx';
import { useDimensions } from '../../../../hooks/use-dimensions.js';


export const StackedAreaChart = ({ width, height, data }) => {
    /* --- margins --- */
    const MARGIN = { top: 80, right: 130, bottom: 70, left: 120 };

    /* --- bounds --- */
    const boundsWidth = width - MARGIN.left - MARGIN.right;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;
    const titleFontSize = Math.max(14, width * 0.025);

    /* --- series configuration --- */
    const seriesKeys = ["coal", "oil", "gas", "nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"];

    /* --- Sort series by total value (descending) --- */
    const sortedSeriesKeys = useMemo(() => {
        return [...seriesKeys].sort((a, b) => {
            const totalA = d3.sum(data, (d) => d[a]);
            const totalB = d3.sum(data, (d) => d[b]);
            return totalB - totalA; // descending
        });
    }, [data, seriesKeys]);

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(sortedSeriesKeys);

    /* --- Data Wrangling: stack the data --- */
    const stackSeries = useMemo(() => {
        return d3
            .stack()
            .keys(sortedSeriesKeys)
            .order(d3.stackOrderNone)
            .offset(d3.stackOffsetNone)(data);
    }, [data, sortedSeriesKeys]);

    /* --- scales --- */
    const [xMin, xMax] = useMemo(() => d3.extent(data, (d) => d.year), [data]);

    const maxY = useMemo(() => {
        return d3.max(data, (d) => d.coal + d.oil + d.gas + d.nuclear + d.hydro + d.solar + d.wind + d.biofuel + d.other_renewable);
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

    /* --- Area Generator --- */
    const areaBuilder = useMemo(() => {
        return d3
            .area()
            .x((d) => xScale(d.data.year))
            .y0((d) => yScale(d[0]))
            .y1((d) => yScale(d[1]));
    }, [xScale, yScale]);

    /* --- SVG Paths --- */
    const allPaths = useMemo(() => {
        return stackSeries.map((serie, i) => {
            return (
                <path
                    key={i}
                    d={areaBuilder(serie)}
                    opacity={1}
                    stroke="none"
                    fill={colorScale(serie.key)}
                    fillOpacity={1}
                />
            );
        });
    }, [stackSeries, areaBuilder, colorScale]);

    /* --- Legend --- */
    const legend = (
        <g transform={`translate(${MARGIN.left + boundsWidth + 20}, ${MARGIN.top - 40})`}>
            {[...sortedSeriesKeys].reverse().map((key, i) => (
                <g key={key} transform={`translate(0, ${i * 20})`}>
                    <rect width={12} height={12} fill={colorScale(key)} />
                    <text x={15} y={10} fontSize={12} textAnchor="start">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                    </text>
                </g>
            ))}
        </g>
    );

    return (
        <svg width={width} height={height}>
            <text
                x={width / 2}
                y={MARGIN.top - 15}
                fontSize={titleFontSize}
                textAnchor="middle"
            >
                World energy mix in TWh
            </text>
            <g
                width={boundsWidth}
                height={boundsHeight}
                transform={`translate(${[MARGIN.left, MARGIN.top].join(",")})`}
            >
                <AxisBottom xScale={xScale} pixelsPerTick={80} boundsHeight={boundsHeight} label="Year" showVerticalGrid={false} />
                <AxisLeft yScale={yScale} pixelsPerTick={40} boundsWidth={boundsWidth} label="Energy [TWh]" />
                {allPaths}
            </g>
            {legend}
        </svg>
    );
};


/*--- responsive wrapper for StackedAreaChart ---*/

export const ResponsiveStackedAreaChart = ({ width = 500, height = 500, ...props }) => {
    const chartRef = useRef(null);
    const chartSize = useDimensions(chartRef);

    const finalWidth = chartSize?.width || width;
    const finalHeight = chartSize?.height || height;

    return (
        <div ref={chartRef} style={{ width: '100%', height: '100%' }}>
            <StackedAreaChart
                width={finalWidth}
                height={finalHeight}
                {...props}
            />
        </div>
    );
};
