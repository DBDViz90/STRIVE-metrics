<<<<<<< HEAD
const TICK_LENGTH = 6;

export const AxisTop = ({ xScale, pixelsPerTick, label, boundsHeight }) => {
  const range = xScale.range();
  const width = range[1] - range[0];
  const numberOfTicksTarget = Math.floor(width / pixelsPerTick);

  return (
    <g transform="translate(0, -25)">
      <line
        x1={range[0]} y1={0} x2={range[1]} y2={0}
        stroke="currentColor" fill="none"
      />
      {xScale.ticks(numberOfTicksTarget).map((value) => (
        <g key={value} transform={`translate(${xScale(value)}, 0)`}>
          <line y1={0} y2={boundsHeight +25} stroke="currentColor" opacity={0.1} />
          <line y2={TICK_LENGTH} stroke="currentColor" />
          <text
            style={{
              fontSize: "10px",
              textAnchor: value === 0 ? "start" : "middle", // Align "0" to the start
              transform: value === 0 ? "translateX(10px) translateY(20px)" : "translateY(20px)"
            }}
          >
            {value}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={width / 2}
          y={-30}
          fontSize={16}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
=======
const TICK_LENGTH = 6;

export const AxisTop = ({ xScale, pixelsPerTick, label, boundsHeight }) => {
  const range = xScale.range();
  const width = range[1] - range[0];
  const numberOfTicksTarget = Math.floor(width / pixelsPerTick);

  return (
    <g transform="translate(0, -25)">
      <line
        x1={range[0]} y1={0} x2={range[1]} y2={0}
        stroke="currentColor" fill="none"
      />
      {xScale.ticks(numberOfTicksTarget).map((value) => (
        <g key={value} transform={`translate(${xScale(value)}, 0)`}>
          <line y1={0} y2={boundsHeight +25} stroke="currentColor" opacity={0.1} />
          <line y2={TICK_LENGTH} stroke="currentColor" />
          <text
            style={{
              fontSize: "10px",
              textAnchor: value === 0 ? "start" : "middle", // Align "0" to the start
              transform: value === 0 ? "translateX(10px) translateY(20px)" : "translateY(20px)"
            }}
          >
            {value}
          </text>
        </g>
      ))}

      {label && (
        <text
          x={width / 2}
          y={-30}
          fontSize={16}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
>>>>>>> b500cfacd90762921c86c39fd98b38001ee79978
};