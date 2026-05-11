import * as d3 from 'd3';

const TICK_LENGTH = 6;

/**
 * Bottom axis component
 * @param {Object} props
 * @param {Function} props.xScale - D3 linear scale for x-axis
 * @param {number} props.pixelsPerTick - Target spacing between ticks in pixels
 * @param {string} props.label - Axis label
 * @param {number} props.boundsHeight - Height of chart bounds
 * @param {boolean} props.showVerticalGrid - Whether to show vertical grid lines
 * @param {number} props.labelFontSize - Font size for axis label
 * @param {number} props.tickFontSize - Font size for tick labels
 * @param {Function} props.tickFormat - Optional function to format tick values (value => string)
 */
export const AxisBottom = ({ 
    xScale, 
    pixelsPerTick, 
    label, 
    boundsHeight, 
    showVerticalGrid = true, 
    labelFontSize = 20, 
    tickFontSize = 15,
    tickFormat = (v) => v.toString()  // Default: convert to string
}) => {
  const range = xScale.range();
  const width = range[1] - range[0];
  const numberOfTicksTarget = Math.floor(width / pixelsPerTick);

  const domain = xScale.domain();

  // Calculate nice interval
  const tickInterval = d3.tickStep(domain[0], domain[1], numberOfTicksTarget);

  // Generate ticks from domain[1] backwards
  let ticks = [];
  for (let v = domain[1]; v > domain[0]; v -= tickInterval) {
      ticks.push(v);
  }
  ticks.reverse();

  // Add domain[0] at start and domain[1] at end, remove duplicates
  ticks = [domain[0], ...ticks, domain[1]];
  ticks = [...new Set(ticks)].sort((a, b) => a - b);

  // Remove 2nd tick if first gap is too small
  if (ticks.length >= 2) {
      const gap = ticks[1] - domain[0];
      if (gap < tickInterval * 0.7) {
          ticks.splice(1, 1);
      }
  }

  return (
    <g transform={`translate(0, ${boundsHeight})`}>
      <line
        x1={range[0]} y1={0} x2={range[1]} y2={0}
        stroke="currentColor" fill="none"
      />
      {ticks.map((value) => (
        <g key={value} transform={`translate(${xScale(value)}, 0)`}>
          {showVerticalGrid && <line y1={0} y2={-boundsHeight - 5} stroke="currentColor" opacity={0.1} />}
          <line y2={TICK_LENGTH} stroke="currentColor" />
          <text
            style={{
              fontSize: `${tickFontSize}px`,
              textAnchor: "middle",
              transform: "translateY(25px)"
            }}
          >
            {tickFormat(value)}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={width / 2}
          y={60}
          fontSize={labelFontSize}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
};

export default AxisBottom;
