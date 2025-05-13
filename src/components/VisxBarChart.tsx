'use client';

import React from 'react';
import { Group } from '@visx/group';
import { Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleBand, scaleLinear } from '@visx/scale';
// import { Text } from '@visx/text'; // Not strictly needed if using axis.label

// Define types for props
interface DataPoint {
  [key: string]: string | number | Date | boolean | null; // More specific than any, covering common data types
}

interface VisxBarChartProps {
  data: DataPoint[];
  xKey: string;
  yKey: string;
  width: number;
  height: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  // New direct color props, to be supplied by parent after computing CSS variables
  barFillColor: string;
  axisStrokeColor: string;
  axisLabelColor: string;
  tickLabelColor: string;
}

const VisxBarChart: React.FC<VisxBarChartProps> = ({
  data,
  xKey,
  yKey,
  width,
  height,
  xAxisLabel,
  yAxisLabel,
  barFillColor,
  axisStrokeColor,
  axisLabelColor,
  tickLabelColor,
}) => {
  if (width <= 0 || height <= 0 || data.length === 0) {
    return <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data or invalid dimensions for chart.</div>;
  }

  // Define margins
  const margin = { top: 30, right: 30, bottom: 70, left: 70 }; // Increased left margin slightly more for y-axis title

  // Calculate inner dimensions
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Accessor functions
  const getXValue = (d: DataPoint) => String(d[xKey] ?? ''); // Ensure it's a string, default to empty if null/undefined
  const getYValue = (d: DataPoint) => Number(d[yKey]) || 0; // Ensure yValue is a number, default to 0 if not

  // Create scales
  const xScale = scaleBand<string>({
    domain: data.map(getXValue),
    range: [0, xMax],
    padding: 0.2, // Padding between bars
  });

  const yScale = scaleLinear<number>({
    domain: [0, Math.max(...data.map(getYValue), 0)], // Start y-axis at 0
    range: [yMax, 0], // Invert range for y-axis (0 is at the top in SVG)
  });

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {/* Render Bars */}
        {data.map((d, i) => {
          const barHeight = yMax - (yScale(getYValue(d)) ?? 0);
          const barX = xScale(getXValue(d));
          const barY = yMax - barHeight;
          
          // Basic validation for bar dimensions
          if (barX === undefined || barHeight < 0 || isNaN(barHeight)) {
            console.warn("Skipping bar due to invalid dimensions", {d, barX, barHeight});
            return null;
          }

          return (
            <Bar
              key={`bar-${i}-${getXValue(d)}`}
              x={barX}
              y={barY}
              width={xScale.bandwidth()}
              height={barHeight}
              fill={barFillColor} // Use new prop
            />
          );
        })}

        {/* Render Axes */}
        <AxisBottom
          top={yMax}
          scale={xScale}
          stroke={axisStrokeColor} // Use new prop
          tickStroke={axisStrokeColor} // Use new prop
          tickLabelProps={() => ({
            fill: tickLabelColor, // Use new prop
            fontSize: 11, // Slightly increased font size for readability
            textAnchor: 'end',
            angle: -40, // Rotate labels
            dy: '0.25em',
            dx: '-0.5em', // Adjust position due to rotation
          })}
          label={xAxisLabel} // X-axis title
          labelProps={{
            x: xMax / 2,
            y: margin.bottom - 15, // Adjusted position for potentially larger font/rotation
            fill: axisLabelColor, // Use new prop
            fontSize: 13,
            textAnchor: 'middle',
            fontWeight: 500,
          }}
          // tickFormat={(value) => String(value).substring(0,15) + (String(value).length > 15 ? '...':'')} // Truncate example
        />
        <AxisLeft
          scale={yScale}
          stroke={axisStrokeColor} // Use new prop
          tickStroke={axisStrokeColor} // Use new prop
          tickLabelProps={() => ({
            fill: tickLabelColor, // Use new prop
            fontSize: 11, // Slightly increased font size
            textAnchor: 'end',
            dx: '-0.25em',
            dy: '0.25em',
          })}
          label={yAxisLabel} // Y-axis title
          labelProps={{
            x: -yMax / 2 ,
            y: -margin.left + 15, // Adjusted position
            fill: axisLabelColor, // Use new prop
            fontSize: 13,
            textAnchor: 'middle',
            transform: 'rotate(-90)', // Rotate Y-axis title
            fontWeight: 500,
          }}
          numTicks={height > 300 ? 5 : 3} // Adjust numTicks based on height
        />
      </Group>
    </svg>
  );
};

export default VisxBarChart; 