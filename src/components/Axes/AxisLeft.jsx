const TICK_LENGTH = 6;

export const AxisLeft = ({ yScale, pixelsPerTick, label, boundsWidth, labelFontSize = 20, tickFontSize = 15 }) => {
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
            {value}
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
