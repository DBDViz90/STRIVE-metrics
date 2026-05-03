import * as d3 from 'd3';

const TICK_LENGTH = 6;

export const AxisBottom = ({ xScale, pixelsPerTick, label, boundsHeight, showVerticalGrid = true }) => {
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
              fontSize: "15px",
              textAnchor: "middle",
              transform: "translateY(25px)"
            }}
          >
            {value}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={width / 2}
          y={60}
          fontSize={20}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
};
