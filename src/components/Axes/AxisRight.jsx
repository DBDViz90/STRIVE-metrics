<<<<<<< HEAD
const TICK_LENGTH = 6;

export const AxisRight = ({ yScale, pixelsPerTick, label, boundsWidth }) => {
  const range = yScale.range();
  const height = range[0] - range[1];
  const numberOfTicksTarget = Math.floor(height / pixelsPerTick);

  return (
    <g>
      <line
        x1={0} x2={0} y1={range[0]} y2={range[1]}
        stroke="currentColor" fill="none"
      />
      {yScale.ticks(numberOfTicksTarget).map((value) => (
        <g key={value} transform={`translate(0, ${yScale(value)})`}>
          <line x1={0} x2={-boundsWidth} stroke="currentColor" opacity={0.1} />
          <line x2={TICK_LENGTH} stroke="currentColor" />
          <text
            style={{
              fontSize: "15px",
              textAnchor: "start",
              transform: "translateX(10px)",
            }}
          >
            {value}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={height / 2}
          y={-90}
          fontSize={20}
          textAnchor="middle"
          transform="rotate(90)"
        >
          {label}
        </text>
      )}
    </g>
  );
};
=======
const TICK_LENGTH = 6;

export const AxisRight = ({ yScale, pixelsPerTick, label, boundsWidth }) => {
  const range = yScale.range();
  const height = range[0] - range[1];
  const numberOfTicksTarget = Math.floor(height / pixelsPerTick);

  return (
    <g>
      <line
        x1={0} x2={0} y1={range[0]} y2={range[1]}
        stroke="currentColor" fill="none"
      />
      {yScale.ticks(numberOfTicksTarget).map((value) => (
        <g key={value} transform={`translate(0, ${yScale(value)})`}>
          <line x1={0} x2={-boundsWidth} stroke="currentColor" opacity={0.1} />
          <line x2={TICK_LENGTH} stroke="currentColor" />
          <text
            style={{
              fontSize: "15px",
              textAnchor: "start",
              transform: "translateX(10px)",
            }}
          >
            {value}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={height / 2}
          y={-90}
          fontSize={20}
          textAnchor="middle"
          transform="rotate(90)"
        >
          {label}
        </text>
      )}
    </g>
  );
};
>>>>>>> b500cfacd90762921c86c39fd98b38001ee79978
