<<<<<<< HEAD
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
    <div className="flex flex-col gap-8 p-4">
      <h1 className="text-center text-2xl font-bold">Exercise : Energy dashboard in D3 + React</h1>
      
      <div className="w-full max-w-4xl mx-auto min-h-[650px] md:min-h-0 md:aspect-[2.5/1]">
        <ResponsiveLineChart data={worldData} />
      </div>
      <div className="w-full max-w-4xl mx-auto min-h-[400px] md:aspect-[2/1]">
        <ResponsiveStackedAreaChart data={worldData} />
      </div>
    </div>
  );
}
=======
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
    <div className="flex flex-col gap-8 p-4">
      <h1 className="text-center text-2xl font-bold">Exercise : Energy dashboard in D3 + React</h1>
      
      <div className="w-full max-w-4xl mx-auto min-h-[650px] md:min-h-0 md:aspect-[2.5/1]">
        <ResponsiveLineChart data={worldData} />
      </div>
      <div className="w-full max-w-4xl mx-auto min-h-[400px] md:aspect-[2/1]">
        <ResponsiveStackedAreaChart data={worldData} />
      </div>
    </div>
  );
}
>>>>>>> b500cfacd90762921c86c39fd98b38001ee79978
