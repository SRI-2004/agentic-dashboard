'use client';

import React, { useMemo } from 'react';
import { QueryResult } from '@/hooks/useChat';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlotParams } from 'react-plotly.js';
import dynamic from 'next/dynamic';
import Image from 'next/image'; // Import next/image

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

// --- NEW TYPE DEFINITIONS ---

// For E2B Image-based suggestions
interface E2BImageGraphSuggestion {
  type: 'image'; // Literal type
  title?: string;
  description?: string;
  image_base64: string;
  original_suggestion?: PlotlyGraphSuggestion; // Keep this for potential reference/fallback details
}

// Existing Plotly-specific internal structure (adjusted for clarity)
interface PlotlyGraphSuggestion {
  type?: 'bar' | 'line' | 'scatter' | 'pie' | 'none' | string; // Allow known Plotly types + string for others
  columns?: {
    x?: string;
    y?: string | string[];
    names?: string;
    values?: string;
    color?: string;
  };
  title?: string;
  description?: string; // Added description here as well
  [key: string]: unknown; // For any other Plotly params
}

// --- UPDATED GraphViewerProps ---
interface GraphViewerProps {
  result: QueryResult | undefined; // QueryResult from useChat
  graphSuggestion: E2BImageGraphSuggestion | PlotlyGraphSuggestion | null; // Union type
  currentIndex: number;
  totalCount: number;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  isInitialState: boolean; // This might be simplified or derived internally
  fontColor: string;
  mutedFontColor: string;
  borderColor: string;
  primaryTraceColor: string;
  colorway: string[];
}

const GraphPlaceholderContent: React.FC = () => {
    const graphAreaHeight = "h-[350px]"; 
    return (
        <div className={`${graphAreaHeight} filter blur-sm opacity-60 pointer-events-none flex flex-col`}> 
            {/* Placeholder Plot Area with Axes and Grid */}
            <div className="flex-grow w-full border rounded-md flex p-2 pr-4 relative overflow-hidden"> 
                 {/* Y-Axis Skeleton */}
                 <Skeleton className="h-full w-4 mr-2 bg-muted-foreground/10" /> 
                 {/* Plot Content Area */}
                 <div className="flex-grow h-full relative"> 
                     {/* X-Axis Skeleton */}
                     <Skeleton className="absolute bottom-0 left-0 h-4 w-full bg-muted-foreground/10" /> 
                     {/* Simulated Grid Lines */}
                     <Skeleton className="absolute top-0 bottom-0 left-[25%] w-px bg-muted-foreground/10" />
                     <Skeleton className="absolute top-0 bottom-0 left-[50%] w-px bg-muted-foreground/10" />
                     <Skeleton className="absolute top-0 bottom-0 left-[75%] w-px bg-muted-foreground/10" />
                     <Skeleton className="absolute left-0 right-0 top-[25%] h-px bg-muted-foreground/10" />
                     <Skeleton className="absolute left-0 right-0 top-[50%] h-px bg-muted-foreground/10" />
                     <Skeleton className="absolute left-0 right-0 top-[75%] h-px bg-muted-foreground/10" />
                     {/* Restore Simulated Plot (or keep simple shape) */}
                     <div className="absolute bottom-[10%] left-[5%] w-[20%] h-[30%] border-b-2 border-l-2 border-primary/30 rounded-bl-lg"></div>
                     <div className="absolute bottom-[35%] left-[25%] w-[25%] h-[40%] border-t-2 border-l-2 border-primary/30 rounded-tl-lg"></div>
                     <div className="absolute bottom-[20%] left-[50%] w-[20%] h-[50%] border-b-2 border-r-2 border-primary/30 rounded-br-lg"></div>
                     <div className="absolute bottom-[60%] left-[70%] w-[25%] h-[25%] border-t-2 border-r-2 border-primary/30 rounded-tr-lg"></div>
                 </div>
             </div>
        </div>
    );
};

const GraphViewer: React.FC<GraphViewerProps> = ({
    result,
    graphSuggestion,
    currentIndex,
    totalCount,
    onNext,
    onPrev,
    isProcessing,
    isInitialState: isInitialStateProp,
    fontColor,
    mutedFontColor,
    borderColor,
    primaryTraceColor,
    colorway
}) => {

    const plotParams = useMemo<PlotParams | null>(() => {
        // Only proceed if it's a Plotly suggestion (not an image or 'none')
        if (!graphSuggestion || graphSuggestion.type === 'image' || graphSuggestion.type === 'none' || !graphSuggestion.type) {
            return null;
        }

        // At this point, graphSuggestion should be a PlotlyGraphSuggestion
        const plotlySuggestion = graphSuggestion as PlotlyGraphSuggestion;
        
        const { type, columns, title: plotlySpecificTitle } = plotlySuggestion; // Use plotlySpecificTitle for clarity
        const data = result?.dataframe;

        if (!data || data.length === 0) {
            return null;
        }

        const xCol = columns?.x;
        const yCol = columns?.y;
        const nameCol = columns?.names;
        const valCol = columns?.values;
        const colorCol = columns?.color; // For data-driven coloring by a column

        const plotData: Partial<Plotly.PlotData>[] = [];
        const layout: Partial<Plotly.Layout> = {
            title: { text: plotlySpecificTitle || result?.objective || 'Generated Graph', font: { size: 16, color: fontColor } },
            xaxis: {
                title: { text: xCol || '', font: { size: 12, color: mutedFontColor } },
                automargin: true,
                gridcolor: borderColor,
                zerolinecolor: borderColor,
                tickfont: { color: mutedFontColor, size: 10 },
            },
            yaxis: {
                title: { text: (Array.isArray(yCol) ? yCol.join(' & ') : yCol) || '', font: { size: 12, color: mutedFontColor } },
                automargin: true,
                gridcolor: borderColor,
                zerolinecolor: borderColor,
                tickfont: { color: mutedFontColor, size: 10 }
            },
            margin: { l: 60, r: 30, t: 50, b: 50 },
            height: 350,
            autosize: true,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: fontColor, family: 'inherit' },
            colorway: colorway,
            hovermode: 'closest',
            legend: {
                orientation: "h", yanchor: "bottom", y: -0.2, xanchor: 'center', x: 0.5,
                bgcolor: 'transparent',
                font: { color: mutedFontColor, size: 10 }
            }
        };

        try {
            switch (type) {
                case 'bar':
                case 'line':
                case 'scatter':
                    // For simplicity, assuming yCol is string for these basic types here.
                    // If yCol is an array for multi-trace, this section needs more complex logic.
                    const yColString = Array.isArray(yCol) ? yCol[0] : yCol; // Take first if array for now
                    if (!xCol || !yColString || !data[0]?.[xCol] || !data[0]?.[yColString]) return null;

                    const xValues = data.map(row => row[xCol]) as Plotly.Datum[];
                    const yValues = data.map(row => row[yColString]) as Plotly.Datum[];
                    
                    const trace: Partial<Plotly.PlotData> = {
                        x: xValues, y: yValues,
                        type: type === 'line' ? 'scatter' : type,
                        mode: type === 'line' ? 'lines+markers' : (type === 'scatter' ? 'markers' : undefined),
                        name: plotlySpecificTitle || yColString,
                        marker: {
                            line: { 
                                color: type === 'bar' ? 'transparent' : undefined,
                                width: type === 'bar' ? 1 : 0 
                            },
                            opacity: 0.9,
                            size: type === 'scatter' ? 8 : undefined,
                        },
                        line: { width: type === 'line' ? 2 : undefined },                        
                        hovertemplate: 
                            `<b>${xCol || 'X'}:</b> %{x}<br>` +
                            `<b>${yColString || 'Y'}:</b> %{y}<br>` +
                            (colorCol && data[0]?.[colorCol] ? `<b>${colorCol}:</b> %{marker.color}<br>` : '') +
                            '<extra></extra>'
                    };

                    if (colorCol && data[0]?.[colorCol]) {
                        const colorValues = data.map(row => row[colorCol]) as Plotly.Color;
                        trace.marker = { ...(trace.marker || {}), color: colorValues };
                        layout.colorway = undefined; // Override theme colorway if data-driven color is used
                    } else {
                        // Assign primaryTraceColor from props to single trace
                        if (trace.marker) trace.marker.color = primaryTraceColor;
                        if (trace.line) trace.line.color = primaryTraceColor;
                    }
                    plotData.push(trace);
                    break;

                case 'pie':
                    if (!nameCol || !valCol || !data[0]?.[nameCol] || !data[0]?.[valCol]) return null;
                    plotData.push({
                        labels: data.map(row => row[nameCol]) as Plotly.Datum[],
                        values: data.map(row => row[valCol]) as Plotly.Datum[],
                        type: 'pie', hole: 0.4,
                        textfont: { size: 10, color: 'white' }, // White text on pie slices for contrast
                        marker: { 
                            colors: colorway,
                            line: { color: 'rgba(255,255,255,0.5)', width: 1 } // Light separation between slices
                        },
                        hoverinfo: 'none',
                        textinfo: 'percent',
                        hovertemplate: 
                            `<b>${nameCol || 'Category'}:</b> %{label}<br>` +
                            `<b>${valCol || 'Value'}:</b> %{value}<br>` +
                            `<b>Percent:</b> %{percent}<extra></extra>`
                    });
                    layout.xaxis = undefined; layout.yaxis = undefined; layout.showlegend = true;
                    break;

                default:
                    console.warn(`Unsupported graph type in suggestion: ${type}`);
                    return null;
            }
        } catch (error) {
            console.error("Error processing graph suggestion data:", error);
            return null;
        }

        return { data: plotData, layout, config: { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] } };
    }, [result, graphSuggestion, fontColor, mutedFontColor, borderColor, primaryTraceColor, colorway]);

    // --- Conditional Rendering Logic ---
    const derivedIsInitialState = isInitialStateProp && !graphSuggestion && !isProcessing;
    // Simplified loading: if processing and no graph suggestion is ready (image or plotly)
    const showLoadingPlaceholder = isProcessing && !graphSuggestion; 
    const hasPlotlyData = plotParams && plotParams.data && plotParams.data.length > 0 && graphSuggestion?.type !== 'image';

    let content: React.ReactNode;

    if (derivedIsInitialState) {
        content = <GraphPlaceholderContent />;
    } else if (showLoadingPlaceholder) {
        content = <GraphPlaceholderContent />; 
    } else if (result?.error) {
        content = (
            <div className="text-destructive bg-destructive/10 p-3 rounded border border-destructive/30 h-full flex items-center justify-center flex-col text-center">
                <p className='font-medium mb-1'>Error processing graph data.</p>
                <pre className='text-sm whitespace-pre-wrap'>{typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}</pre>
            </div>
        );
    } else if (graphSuggestion) {
        if (graphSuggestion.type === 'image') {
            const e2bSuggestion = graphSuggestion as E2BImageGraphSuggestion; // Type assertion
            content = (
                <div style={{ position: 'relative', width: '100%', height: '360px' }}> {/* Parent for Next/Image fill */} 
                    <Image
                        src={`data:image/png;base64,${e2bSuggestion.image_base64}`}
                        alt={e2bSuggestion.title || 'Generated Graph'}
                        layout="fill"
                        objectFit="contain"
                        unoptimized // Recommended for base64/data URLs if not optimizing externally
                    />
                </div>
            );
        } else if (graphSuggestion.type && graphSuggestion.type !== 'none' && hasPlotlyData) {
            // Render Plotly chart
            content = (
                <Plot
                    data={plotParams!.data} // plotParams is checked by hasPlotlyData
                    layout={plotParams!.layout}
                    config={plotParams!.config}
                    className="w-full h-[360px]" 
                    useResizeHandler={true}
                />
            );
        } else if (graphSuggestion.type === 'none') {
            content = <p className="text-muted-foreground italic h-full flex items-center justify-center">No graph needed for this insight.</p>;
        } else if (graphSuggestion.type && graphSuggestion.type !== 'image' && !hasPlotlyData && !isProcessing) {
            // This case covers when it's a plotly type but plotParams failed or data is missing
            content = <p className="text-muted-foreground italic h-full flex items-center justify-center">Graph data is unavailable or not in a recognized Plotly format.</p>;
        } else if (isProcessing) { // Catch-all for processing if no other condition met (e.g. suggestion changed but processing still true)
             content = <GraphPlaceholderContent />;
        } else {
             content = <p className="text-muted-foreground italic h-full flex items-center justify-center">Graph suggestion is in an unrecognized format or data is missing.</p>;
        }
    } else if (isProcessing) { 
        content = <GraphPlaceholderContent />;
    } else {
        content = <p className="text-muted-foreground italic h-full flex items-center justify-center">No graph data available.</p>;
    }

    return (
        <Card className="h-auto min-h-[450px] flex flex-col"> {/* Ensure card can grow/shrink */}
            <CardHeader className="flex-row items-center justify-between flex-shrink-0">
                <CardTitle className="truncate pr-2"> {/* Allow title to truncate */}
                    {graphSuggestion?.title || (result?.objective ? `${result.objective}` : 'Graph')}
                </CardTitle>
                {totalCount > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="outline" size="icon" onClick={onPrev} disabled={currentIndex <= 0 || isProcessing}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {currentIndex + 1} / {totalCount}
                        </span>
                        <Button variant="outline" size="icon" onClick={onNext} disabled={currentIndex >= totalCount - 1 || isProcessing}>
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center overflow-hidden p-2 md:p-4"> {/* Responsive padding */}
                {content}
            </CardContent>
        </Card>
    );
};

export default GraphViewer; 