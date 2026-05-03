/*--- htmlTagWrap = Alt-w ---*/

import { useState } from 'react';
import './App.css'
import { data } from './data.js'
import { ResponsiveStackedAreaChart } from './components/charts/1_stacked_area_chart/stacked_area_chart.jsx';
import { ResponsiveLineChart } from './components/charts/3_line_chart/line_chart.jsx';

export default function App() {
  // For now, no hover
  //const [hoveredData, setHoveredData] = useState(null);

  /* --- World filtered data --- */
  const worldData = data.filter(d => d.country === "World");

  return (
    /*
    <ResponsiveStackedAreaChart
      data={worldData}
      width={width}
      height={height}
    />
    */

  <div className="w-full max-w-4xl mx-auto aspect-[2/1]">
    <ResponsiveLineChart data={worldData} />
  </div>
  );
}