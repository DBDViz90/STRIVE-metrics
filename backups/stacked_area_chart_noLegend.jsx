/* --- Global (world) energy mix in TWh over time from 1965 to 2024 --- */

import { useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { AxisBottom } from '../../Axes/AxisBottom.jsx';
import { AxisRight } from '../../Axes/AxisRight.jsx';
import { useDimensions } from '../../../../hooks/use-dimensions.js';


export const StackedAreaChart = ({ width, height, data }) => {
    /* --- margins --- */
    const MARGIN = { top: 60, right: 120, bottom: 70, left: 80 };

    /* --- bounds --- */
    const boundsWidth = width - MARGIN.left - MARGIN.right;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;
    const titleFontSize = Math.max(14, width * 0.025);

    /* --- Color Scale --- */
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(["coal", "oil", "gas", "nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"]);

    /* --- Data Wrangling: stack the data --- */
    const stackSeries = useMemo(() => {
        return d3
            .stack()
            .keys(["coal", "oil", "gas", "nuclear", "hydro", "solar", "wind", "biofuel", "other_renewable"])
            .order(d3.stackOrderDescending)
            .offset(d3.stackOffsetNone)(data);
    }, [data]);

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
                <AxisBottom xScale={xScale} pixelsPerTick={80} boundsHeight={boundsHeight} label="Year" />
                <g transform={`translate(${boundsWidth}, 0)`}>
                    <AxisRight yScale={yScale} pixelsPerTick={80} boundsWidth={boundsWidth} label="Energy [TWh]" />
                </g>
                {allPaths}
            </g>
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
