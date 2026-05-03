/*--- Responsive chart model that serves as a reference for how to make the other chart responsive ---*/

import { useRef} from "react";
import { useDimensions } from "./use-dimensions.js"
import { scaleLinear } from "d3";

export const Scatterplot = ({width, height, data}) => {
  const xScale = scaleLinear().domain([0, 100]).range([0, width]);
  const yScale = scaleLinear().domain([0, 100]).range([height, 0]);

  return (
    <svg width={width} height={height}>
      <rect width={width} height={height} fill="#f8f8f8" rx={4} />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={xScale(d.x)}
          cy={yScale(d.y)}
          r={8}
          fill="#69b3a2"
          opacity={0.8}
        />
      ))}
    </svg>
  );
};

/*--- Wrapper ---*/

export const ResponsiveScatterplot = (props) => {
  const chartRef = useRef(null);
  const chartSize = useDimensions(chartRef);
  
  return (
    <div ref={chartRef} style={{ width: "100%", height: 300 }}>
      <Scatterplot width={chartSize.width} height={chartSize.height} {...props}/>
    </div>
  );
};