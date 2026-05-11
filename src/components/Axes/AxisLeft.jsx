const TICK_LENGTH = 6;

/**
 * Left axis component
 * @param {Object} props
 * @param {Function} props.yScale - D3 linear scale for y-axis
 * @param {number} props.pixelsPerTick - Target spacing between ticks in pixels
 * @param {string} props.label - Axis label
 * @param {number} props.boundsWidth - Width of chart bounds
 * @param {number} props.labelFontSize - Font size for axis label
 * @param {number} props.tickFontSize - Font size for tick labels
 * @param {Function} props.tickFormat - Optional function to format tick values (value => string)
 */
export const AxisLeft = ({ 
    yScale, 
    pixelsPerTick, 
    label, 
    boundsWidth, 
    labelFontSize = 20, 
    tickFontSize = 15,
    tickFormat = (v) => v.toString()  // Default: convert to string
}) => {
  const range = yScale.range();
  const height = range[0] - range[1];
  const numberOfTicksTarget = Math.floor(height / pixelsPerTick);

  return (
    <g>
      <line
        x1={0} x2={0} y1={range[0]} y2={range[1]-5}
        stroke="currentColor" fill="none" opacity={0.3}
      />
      {yScale.ticks(numberOfTicksTarget).map((value) => (
        <g key={value} transform={`translate(0, ${yScale(value)})`}>
          <line x1={0} x2={boundsWidth} stroke="currentColor" opacity={0.1} />
          <line x2={-TICK_LENGTH} stroke="currentColor" opacity={0.3} />
          <text
            style={{
              fontSize: `${tickFontSize}px`,
              textAnchor: "middle",
              transform: "translateX(-30px)",
            }}
          >
            {tickFormat(value)}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={-height / 2}
          y={-80}
          fontSize={labelFontSize}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {label}
        </text>
      )}
    </g>
  );
};

export default AxisLeft;
