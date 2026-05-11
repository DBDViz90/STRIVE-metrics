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
    const PANE_HEIGHT = 200; // Approximate height of pane with all checkboxes


    /* --- margins --- */
    const MARGIN = { top: 50, right: 30, bottom: 60, left: 120 };


    /* --- chart dimensions --- */
    const MOBILE_BREAKPOINT = 768;
    const isMobileLayout = width < MOBILE_BREAKPOINT;
    const effectivePaneWidth = isMobileLayout ? 0 : PANE_WIDTH;
    const effectiveGap = isMobileLayout ? 0 : GAP;
    const chartWidth = width - effectivePaneWidth - effectiveGap;
    const chartHeight = isMobileLayout ? height - PANE_HEIGHT : height;
    const boundsWidth = chartWidth - MARGIN.left - MARGIN.right;
    const boundsHeight = chartHeight - MARGIN.top - MARGIN.bottom;
    const titleFontSize = Math.max(14, width * 0.025);
    const axisLabelFontSize = Math.max(14, width * 0.02);
    const tickFontSize = Math.max(12, width * 0.018);


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

    /* --- Order checkboxes by 2024 values (descending) --- */
    const lastYearData = data[data.length - 1];
    const checkboxOrder = useMemo(() => {
        return [...seriesKeys].sort((a, b) => (lastYearData?.[b] || 0) - (lastYearData?.[a] || 0));
    }, [lastYearData, seriesKeys]);


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
        <div className="flex flex-col md:flex-row gap-2 md:gap-4" style={{ height }}>
            <div className="flex-1 min-w-0">
                <svg width={chartWidth} height={chartHeight}>
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
                        <AxisBottom xScale={xScale} pixelsPerTick={100} boundsHeight={boundsHeight} label="Year" showVerticalGrid={false} labelFontSize={axisLabelFontSize} tickFontSize={tickFontSize} />
                        <AxisLeft yScale={yScale} pixelsPerTick={60} boundsWidth={boundsWidth} label="Energy [TWh]" labelFontSize={axisLabelFontSize} tickFontSize={tickFontSize} />
                    </g>
                </svg>
            </div>
            <div className="w-full md:w-48 bg-white p-2 md:p-4 rounded-lg shadow-lg space-y-1 md:space-y-2 shrink-0 -mt-2 md:mt-0">
                {checkboxOrder.map((key) => (
                    <div key={key} className="flex items-center gap-1 md:gap-2">
                        <Checkbox
                            id={`series-${key}`}
                            checked={visibleSeries.has(key)}
                            onCheckedChange={() => toggleSeries(key)}
                            className="w-4 h-4 md:w-5 md:h-5"
                            style={{
                                borderColor: colorScale(key),
                                backgroundColor: visibleSeries.has(key) ? colorScale(key) : 'transparent'
                            }}
                        />
                        <label htmlFor={`series-${key}`} className="capitalize text-xs md:text-sm">
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

