'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { QueryResult, GraphSuggestion as ChatGraphSuggestion } from '@/hooks/useChat';
import TableViewer from './TableViewer';
import GraphViewer from './GraphViewer';
// import VisxBarChart from './VisxBarChart'; // Comment out VisxBarChart for now
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface DataExplorerProps {
  queryResults: QueryResult[];
  graphSuggestions: ChatGraphSuggestion[];
  isProcessing: boolean;
  onSetPendingContext: (context: { display: string; backend: string }) => void;
}

// Default fallback colors if CSS variables are not found or in SSR
const defaultPlotlyColors = {
  font: '#333333', // Fallback for --foreground
  mutedFont: '#666666', // Fallback for --muted-foreground
  border: '#d0d0d0', // Fallback for --border
  trace1: '#1f77b4', // Default Plotly blue as fallback for --chart-1 or --primary
  colorway: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'] // Default Plotly colorway
};

// --- Main Data Explorer Component --- 
const DataExplorer: React.FC<DataExplorerProps> = ({ queryResults, graphSuggestions, isProcessing, onSetPendingContext }) => {
  const [currentTableIndex, setCurrentTableIndex] = useState(0);
  const [currentGraphIndex, setCurrentGraphIndex] = useState(0); // This will now index into graphSuggestions

  const [plotlyThemeColors, setPlotlyThemeColors] = useState({
    fontColor: defaultPlotlyColors.font,
    mutedFontColor: defaultPlotlyColors.mutedFont,
    borderColor: defaultPlotlyColors.border,
    primaryTraceColor: defaultPlotlyColors.trace1,
    colorway: defaultPlotlyColors.colorway,
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rootStyles = getComputedStyle(document.documentElement);
      const getColor = (varName: string, fallback: string) => rootStyles.getPropertyValue(varName).trim() || fallback;
      
      setPlotlyThemeColors({
        fontColor: getColor('--foreground', defaultPlotlyColors.font),
        mutedFontColor: getColor('--muted-foreground', defaultPlotlyColors.mutedFont),
        borderColor: getColor('--border', defaultPlotlyColors.border),
        primaryTraceColor: getColor('--chart-1', getColor('--primary', defaultPlotlyColors.trace1)), // Prioritize --chart-1, then --primary
        colorway: [
          getColor('--chart-1', getColor('--primary', defaultPlotlyColors.colorway[0])),
          getColor('--chart-2', defaultPlotlyColors.colorway[1]),
          getColor('--chart-3', defaultPlotlyColors.colorway[2]),
          getColor('--chart-4', defaultPlotlyColors.colorway[3]),
          getColor('--chart-5', defaultPlotlyColors.colorway[4]),
          getColor('--secondary', defaultPlotlyColors.colorway[5]), // Example: use --secondary for the last one
        ],
      });
    }
    // Re-run if theme changes (if a theme context/variable is available and changes)
  }, []); 

  const totalTableResults = queryResults.length; // Renamed for clarity
  const totalGraphSuggestions = graphSuggestions.length; // New: total number of graph suggestions

  const isInitialState = !isProcessing && totalTableResults === 0 && totalGraphSuggestions === 0;

  React.useEffect(() => {
    // Reset/clamp table index
    if (totalTableResults === 0) {
      setCurrentTableIndex(0);
    } else if (currentTableIndex >= totalTableResults) {
      setCurrentTableIndex(Math.max(0, totalTableResults - 1));
    }

    // Reset/clamp graph index
    if (totalGraphSuggestions === 0) {
      setCurrentGraphIndex(0);
    } else if (currentGraphIndex >= totalGraphSuggestions) {
      setCurrentGraphIndex(Math.max(0, totalGraphSuggestions - 1));
    }
  }, [totalTableResults, totalGraphSuggestions, currentTableIndex, currentGraphIndex]);

  const handleNextTable = () => setCurrentTableIndex(prev => Math.min(prev + 1, totalTableResults > 0 ? totalTableResults - 1 : 0));
  const handlePrevTable = () => setCurrentTableIndex(prev => Math.max(prev - 1, 0));

  // Updated graph pagination
  const handleNextGraph = () => setCurrentGraphIndex(prev => Math.min(prev + 1, totalGraphSuggestions > 0 ? totalGraphSuggestions - 1 : 0));
  const handlePrevGraph = () => setCurrentGraphIndex(prev => Math.max(prev - 1, 0));

  const selectedTableResult = totalTableResults > 0 ? queryResults[currentTableIndex] : undefined;
  
  // The suggestion to display is now directly from the graphSuggestions array
  const currentRawGraphSuggestion = totalGraphSuggestions > 0 ? graphSuggestions[currentGraphIndex] : null;

  // Determine the data source (QueryResult) for the current graph suggestion, especially for Plotly fallbacks
  const dataSourceForCurrentGraph = useMemo<QueryResult | undefined>(() => {
    if (!currentRawGraphSuggestion) return undefined;

    let objectiveToMatch: string | undefined = undefined;

    if (currentRawGraphSuggestion.type === 'image' && currentRawGraphSuggestion.original_suggestion) {
      // If it's an image, the original_suggestion holds the link to the data source objective
      objectiveToMatch = (currentRawGraphSuggestion.original_suggestion as any).data_source_objective;
    } else if (currentRawGraphSuggestion.type !== 'image') {
      // If it's a direct Plotly suggestion, its own 'objective' or a similar field should link it.
      // This depends on the exact structure of fallback Plotly suggestions from backend.
      // Let's assume it might have a top-level 'objective' or 'data_source_objective' field.
      objectiveToMatch = (currentRawGraphSuggestion as any).objective || (currentRawGraphSuggestion as any).data_source_objective;
      // If not, it might be that all plotly fallbacks use the first queryResult, or this needs more specific logic.
      // For now, if objectiveToMatch is still undefined for a Plotly type, we might default or log a warning.
    }
    
    if (!objectiveToMatch) {
        // If a Plotly type graph has no clear objective to match, we might default to the first queryResult
        // or the one matching currentTableIndex if that makes sense contextually.
        // This is a fallback strategy if a direct link isn't clear from the suggestion itself.
        // For now, let's try to find a match or return undefined.
        console.warn(`[DataExplorer] dataSourceForCurrentGraph: Could not determine objectiveToMatch for graph suggestion: ${currentRawGraphSuggestion.title}`);
        // Attempt to find a generic match if any queryResult.objective is part of the graph title or vice-versa
        // This is a loose fallback.
        return queryResults.find(qr => 
          qr.objective && (currentRawGraphSuggestion?.title?.includes(qr.objective) || qr.objective.includes(currentRawGraphSuggestion?.title || ''))
        ) || (queryResults.length > 0 ? queryResults[0] : undefined); // Default to first if no match
    }

    // Find the QueryResult whose objective is PART of or EQUALS objectiveToMatch from the graph suggestion
    // e.g., qr.objective = "google: Insight Query 1", objectiveToMatch = "Insight Query 1"
    const foundResult = queryResults.find(qr => qr.objective && qr.objective.includes(objectiveToMatch!));
    
    if (!foundResult) {
      console.warn(`[DataExplorer] dataSourceForCurrentGraph: No QueryResult found for objective: "${objectiveToMatch}". Using first QueryResult as fallback if available.`);
      return queryResults.length > 0 ? queryResults[0] : undefined; // Default to first query result if no specific match found
    }
    return foundResult;
  }, [currentRawGraphSuggestion, queryResults]);

  const finalGraphSuggestionForViewer = useMemo(() => {
    if (!currentRawGraphSuggestion) {
      console.log("[DataExplorer] finalGraphSuggestionForViewer: No currentRawGraphSuggestion, returning null.");
      return null;
    }
    console.log(`[DataExplorer] finalGraphSuggestionForViewer: Processing raw suggestion titled: "${currentRawGraphSuggestion.title}", type: "${currentRawGraphSuggestion.type}"`);

    if (currentRawGraphSuggestion.type === 'image') {
      console.log("[DataExplorer] finalGraphSuggestionForViewer: It's an image type. Passing as E2BImageGraphSuggestion.");
      return {
        type: 'image',
        title: currentRawGraphSuggestion.title,
        description: currentRawGraphSuggestion.description,
        image_base64: currentRawGraphSuggestion.image_base64,
        original_suggestion: currentRawGraphSuggestion.original_suggestion
      } as any; 
    }
    
    let sourceForPlotly = currentRawGraphSuggestion;
    console.log("[DataExplorer] finalGraphSuggestionForViewer: It's a Plotly type. Transforming source:", sourceForPlotly);
    
    const {
        x_axis, y_axis, names, values, color_column, 
        chart_type, title, description,
        type: relevantType, 
        ...restOfChatSuggestion
    } = sourceForPlotly as any; // Cast sourceForPlotly to any to access diverse fields

    const plotlyCompatibleSuggestion: any = { 
        type: chart_type || relevantType, 
        title: title,
        description: description,
        columns: {},
        ...restOfChatSuggestion
    };

    if (plotlyCompatibleSuggestion.columns) { 
        if (x_axis) plotlyCompatibleSuggestion.columns.x = x_axis;
        if (y_axis) plotlyCompatibleSuggestion.columns.y = y_axis;
        if (names) plotlyCompatibleSuggestion.columns.names = names;
        if (values) plotlyCompatibleSuggestion.columns.values = values;
        if (color_column) plotlyCompatibleSuggestion.columns.color = color_column;
    }
    
    if (plotlyCompatibleSuggestion.type === 'image' || plotlyCompatibleSuggestion.type === 'none') {
        if (plotlyCompatibleSuggestion.type === 'none') {
            console.log("[DataExplorer] finalGraphSuggestionForViewer: Transformed to 'none' type.");
            return { type: 'none', title };
        }
        console.warn("[DataExplorer] finalGraphSuggestionForViewer: Transformed to 'image' or null unexpectedly for a Plotly path.");
        return null; 
    }
    console.log("[DataExplorer] finalGraphSuggestionForViewer: Successfully transformed to PlotlyCompatibleSuggestion:", plotlyCompatibleSuggestion);
    return plotlyCompatibleSuggestion;
  }, [currentRawGraphSuggestion]);

  const renderGraph = () => {
    // Use totalGraphSuggestions for initial state check regarding graphs
    if (isInitialState && totalGraphSuggestions === 0) { 
      return (
        <Card className="h-[450px]">
          <CardHeader>
            <CardTitle>Graph</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No graph to display.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <GraphViewer
        result={dataSourceForCurrentGraph} // Use the dynamically found data source
        graphSuggestion={finalGraphSuggestionForViewer}
        currentIndex={currentGraphIndex} // Current index within graphSuggestions
        totalCount={totalGraphSuggestions} // Total number of graph suggestions
        onNext={handleNextGraph}
        onPrev={handlePrevGraph}
        isProcessing={isProcessing}
        // Adjust isInitialState for GraphViewer based on whether finalGraphSuggestionForViewer is ready
        isInitialState={!isProcessing && !finalGraphSuggestionForViewer} 
        fontColor={plotlyThemeColors.fontColor}
        mutedFontColor={plotlyThemeColors.mutedFontColor}
        borderColor={plotlyThemeColors.borderColor}
        primaryTraceColor={plotlyThemeColors.primaryTraceColor}
        colorway={plotlyThemeColors.colorway}
      />
    );
  };

  return (
    <div className="space-y-6">
      <TableViewer
        key={`table-${currentTableIndex}`}
        result={selectedTableResult}
        currentIndex={currentTableIndex}
        totalCount={totalTableResults}
        onNext={handleNextTable}
        onPrev={handlePrevTable}
        isProcessing={isProcessing}
        isInitialState={isInitialState}
        onSetPendingContext={onSetPendingContext}
      />
      {renderGraph()}
    </div>
  );
};

export default DataExplorer;