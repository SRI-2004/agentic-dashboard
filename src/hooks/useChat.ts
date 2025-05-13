import { useState, useCallback, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';

// Define the structure of a chat message
export interface ChatMessage {
  id: string; // Add unique ID for React keys
  role: 'user' | 'assistant' | 'system' | 'milestone' | 'context_info'; // Add milestone role
  content: string; // Main text or summary for milestone OR fallback text
  // Optional fields based on backend stream
  reasoning?: string;
  reportSections?: { title: string; content: string }[]; // Store structured sections
  // Store the array of queries directly
  generatedQueries?: { objective: string; query: string }[]; 
  step?: string; // Associate milestone with a step
}

// Define structure for individual query results (used in DataExplorer)
export interface QueryResult {
  objective: string;
  query: string;
  dataframe: Record<string, unknown>[]; // Array of data rows
  error?: string;
  platform?: string; // Optional: if we want to tag single query_result messages too
}

// Define structure for graph suggestions
export interface GraphSuggestion {
  objective: string; // To link suggestion to a query objective if needed
  // Add other fields that your backend sends for graph suggestions
  // For example:
  type?: string; // e.g., 'bar', 'line'
  x_axis?: string; // column name for x-axis
  y_axis?: string | string[]; // column name(s) for y-axis
  title?: string;
  description?: string;
  [key: string]: unknown; // Allow other properties
}

// Define an interface for the actual structure received from backend for graph suggestions
// if it differs from the frontend GraphSuggestion type (e.g., uses 'columns')
interface BackendGraphSuggestionFormat {
  objective: string;
  type?: string;
  title?: string;
  description?: string;
  columns?: {
    x?: string;
    y?: string | string[];
    [key: string]: unknown; // Allow other fields within columns
  };
  [key: string]: unknown; // Allow other top-level properties from backend
}

// Define the structure of messages coming FROM the WebSocket
interface WebSocketMessage {
    type: string; // 'status', 'reasoning_summary', 'final_insight', 'final_recommendations', 'error', 'generated_queries', 'query_result', 'classifier_answer', 'classifier_info', 'routing_decision', 'graph_suggestions', 'connection_established'
    user_id?: string; // <-- Added user_id for connection_established
    // Add fields based on the backend stream types
    step?: string;
    status?: string;
    details?: string;
    reasoning?: string;
    insight?: string;
    report_sections?: { title: string; content: string }[]; // For structured reports
    graph_suggestions?: BackendGraphSuggestionFormat[]; // Use BackendGraphSuggestionFormat here
    message?: string; // for errors
    generated_queries?: { objective: string; query: string }[]; // From backend status update
    objective?: string;
    query?: string;
    data?: Record<string, unknown>[]; // Changed any to unknown
    error?: string; // Query execution error
    requires_execution?: boolean; // Added for workflows that might not need query execution
    content?: string;
    workflow_type?: string;
    classification_details?: Record<string, unknown>; // Changed any to unknown
    platform?: string; // For individual query_result messages
    // New field for combined results in final_insight
    executed_queries?: { platform: string, objective: string, query: string, data: Record<string, unknown>[] }[];
}

// Get WebSocket URL from environment variable
const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

if (!WEBSOCKET_URL) {
  console.error("Error: NEXT_PUBLIC_WEBSOCKET_URL environment variable is not set!");
  // Optionally provide a default or throw an error depending on requirements
}

export function useChat() {
  // User ID received from WebSocket connection
  const [userId, setUserId] = useState<string | null>(null);
  // Main chat history (including milestones)
  const [messages, setMessages] = useState<ChatMessage[]>([
      {
        id: 'init_message',
        role: 'system',
        content: 'Hello! I am your Insight Assistant. Ask me to analyze your data or suggest optimizations.'
      }
  ]);
  // Data for the right-hand pane
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  // Live status update string
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  // State for the graph suggestions (now a list)
  const [graphSuggestions, setGraphSuggestions] = useState<GraphSuggestion[]>([]); // Use the specific interface

  const {
    // sendMessage: sendWebSocketMessage, // We don't use the hook's sendMessage anymore
    lastJsonMessage,
    readyState,
  } = useWebSocket<WebSocketMessage>(WEBSOCKET_URL || '', { // Use URL or empty string if undefined
    share: false, 
    shouldReconnect: () => true, 
    retryOnError: true, // Attempt to reconnect on error
    onOpen: () => { console.log('WebSocket Connected'); setCurrentStatus(null); setIsProcessing(false); /* userId will be set on message */ },
    onClose: () => { console.log('WebSocket Disconnected'); setUserId(null); setCurrentStatus('Connection closed.'); setIsProcessing(false); },
    onError: (event) => { console.error('WebSocket Error:', event); setUserId(null); setCurrentStatus('Connection error.'); setIsProcessing(false); },
  }, !!WEBSOCKET_URL);

  // Function to generate unique IDs
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Helper to add a new message to the chat
  const addMessageToChat = (role: ChatMessage['role'], content: string, additionalFields: Partial<ChatMessage> = {}) => {
    setMessages(prev => [...prev, { id: generateId(), role, content, ...additionalFields }]);
  };

  // Helper to process executed_queries from backend messages
  const handleExecutedQueries = (executedQueries: WebSocketMessage['executed_queries']) => {
    if (executedQueries && Array.isArray(executedQueries)) {
      console.log("Processing executed_queries to create separate table results.");
      const newQueryResults: QueryResult[] = [];
      executedQueries.forEach((executedQuery, index) => {
        if (executedQuery.data) {
          newQueryResults.push({
            objective: executedQuery.objective || `Executed Query ${index + 1}`,
            query: executedQuery.query || "N/A",
            dataframe: executedQuery.data || [],
            platform: executedQuery.platform
          });
        } else {
          console.warn(`Executed query at index ${index} has no data. Skipping.`);
        }
      });
      setQueryResults(newQueryResults);
      console.log("Updated queryResults with separate results from executed_queries:", newQueryResults);
      return true; // Indicate that results were processed
    }
    return false; // Indicate no results were processed
  };

  // Helper to process graph_suggestions from backend messages
  const handleGraphSuggestions = (backendSuggestions: BackendGraphSuggestionFormat[] | undefined) => {
    if (backendSuggestions && Array.isArray(backendSuggestions) && backendSuggestions.length > 0) {
      console.log("[useChat] Received backend graph suggestions:", backendSuggestions);
      const mappedSuggestions: GraphSuggestion[] = backendSuggestions.map(bs => {
        const { columns, ...restOfSuggestion } = bs; // Destructure 'columns'
        // Ensure x_axis and y_axis are only added if they exist in columns
        const mapped: GraphSuggestion = {
          ...restOfSuggestion, // Spread other properties like objective, type, title, description
          objective: restOfSuggestion.objective || 'Unknown Objective', // Ensure objective is always present
        };
        if (columns?.x) {
          mapped.x_axis = columns.x;
        }
        if (columns?.y) {
          mapped.y_axis = columns.y;
        }
        return mapped;
      });
      console.log("[useChat] Mapped graph suggestions for frontend:", mappedSuggestions);
      setGraphSuggestions(mappedSuggestions);
    } else {
      setGraphSuggestions([]);
      console.log("[useChat] No graph suggestions found or suggestions array empty. Clearing suggestions.");
    }
  };

  // --- Process incoming WebSocket messages --- 
  useEffect(() => {
    if (lastJsonMessage) {
      console.log('Received WS Message:', lastJsonMessage); // Debugging
      const { type, step, status } = lastJsonMessage;

      // Handle different message types from backend
      switch (type) {
        case 'connection_established': // Handle initial connection message
          if (lastJsonMessage.user_id) {
            setUserId(lastJsonMessage.user_id);
            console.log('Received user_id:', lastJsonMessage.user_id);
          } else {
            console.error('connection_established message received without user_id');
          }
          break;
          
        case 'status':
          const statusText = `**${step?.replace(/_/g, ' ')}**: ${status?.replace(/_/g, ' ')}${lastJsonMessage.details ? ` - ${lastJsonMessage.details}` : ''}`;
          setCurrentStatus(statusText);

          if (step?.endsWith('workflow_end')) {
              setCurrentStatus(null); 
              setIsProcessing(false);
          } else if (status === 'completed') {
              let milestoneContent = `✅ ${step?.replace(/_/g, ' ')} Finished`;
              let milestoneQueries: { objective: string; query: string }[] | undefined = undefined;

              if (step?.includes('generate') && step?.includes('queries') && lastJsonMessage.generated_queries) {
                   const queryCount = lastJsonMessage.generated_queries.length;
                   const queryNoun = queryCount === 1 ? 'query' : 'queries';
                   milestoneContent = `✅ Query Generation Finished (${queryCount} ${queryNoun})`;
                   milestoneQueries = lastJsonMessage.generated_queries; 
              } else if (step?.includes('execute') && step?.includes('queries')) {
                  milestoneContent = `✅ Query Execution Finished`;
              } else if (step?.includes('classification')) {
                  milestoneContent = `✅ Classification Finished`;
              }

              if (step?.includes('generate') || step?.includes('execute') || step?.includes('classification')) {
                  setMessages(prev => [...prev, { 
                      id: generateId(), 
                      role: 'milestone', 
                      content: milestoneContent, 
                      step: step, 
                      generatedQueries: milestoneQueries 
                  }]);
              }
          }
          break;

        case 'classifier_info':
            if (typeof lastJsonMessage.content === 'string' && lastJsonMessage.content.trim() !== '') {
                 const messageContent = lastJsonMessage.content; 
                 addMessageToChat('assistant', messageContent);
                 setCurrentStatus("Planning workflow..."); 
            } else {
                console.warn("Received classifier_info with no valid content.");
            }
            break;
            
        case 'classifier_answer':
             if (typeof lastJsonMessage.content === 'string' && lastJsonMessage.content.trim() !== '') {
                 const messageContent = lastJsonMessage.content; 
                 addMessageToChat('assistant', messageContent);
                 setCurrentStatus(null); 
                 setIsProcessing(false);
            } else {
                 console.warn("Received classifier_answer with no valid content.");
                 setCurrentStatus(null); 
                 setIsProcessing(false);
            }
            break;

        case 'reasoning_summary':
          if (step && lastJsonMessage.reasoning) {
            const reasoningText = `**Reasoning:**\n${lastJsonMessage.reasoning}`; 
            setMessages(prev => {
                const lastMilestoneIndex = prev.findLastIndex(m => m.role === 'milestone' && m.step === step);
                if (lastMilestoneIndex !== -1) {
                    const updatedMessages = [...prev];
                    updatedMessages[lastMilestoneIndex] = { ...updatedMessages[lastMilestoneIndex], reasoning: reasoningText };
                    return updatedMessages;
                }
                return prev;
            });
          }
          break;

        case 'final_insight':
          const insightContent = lastJsonMessage.insight || 'No final insight received.';
          const insightReasoning = lastJsonMessage.reasoning;
          const insightGraphSuggestions = lastJsonMessage.graph_suggestions || [];
          
          addMessageToChat('assistant', insightContent, {
            reasoning: insightReasoning ? `**Final Reasoning:**\\n${insightReasoning}` : undefined,
            step: step
          });
          
          // Handle executed_queries
          if (!handleExecutedQueries(lastJsonMessage.executed_queries)) {
            console.log("Processed final_insight without executed_queries (standard single-platform insight).");
            // Potentially clear queryResults if needed for single-platform, or leave as is
            // For now, leaving as is, as query_result messages might populate it for single platform.
          }

          // Handle graph suggestions based on the final state
          handleGraphSuggestions(insightGraphSuggestions);

          setCurrentStatus(null); 
          setIsProcessing(false);
          break;

        case 'final_recommendation':
           const reportSections = lastJsonMessage.report_sections;
           const reportReasoning = lastJsonMessage.reasoning;
           const recommendationGraphSuggestions = lastJsonMessage.graph_suggestions;
           if (recommendationGraphSuggestions && Array.isArray(recommendationGraphSuggestions)) {
              console.log("Received graph suggestions within final_recommendation:", recommendationGraphSuggestions);
              setGraphSuggestions(recommendationGraphSuggestions as GraphSuggestion[]); 
           } else {
              setGraphSuggestions([]); // Clear if no suggestions provided
              console.log("No graph suggestions found in final_recommendation message.");
           }
           
           addMessageToChat('assistant', 
             reportSections ? `Optimization report generated with ${reportSections.length} sections.` : 'Optimization report received.',
             {
               reportSections: reportSections,
               reasoning: reportReasoning ? `**Final Reasoning:**\\n${reportReasoning}` : undefined,
               step: step
             }
           );
           
           // Handle executed_queries for general optimization workflow
           if (!handleExecutedQueries(lastJsonMessage.executed_queries)) {
             setQueryResults([]); // Clear results if no executed_queries in final_recommendation
             console.log("Processing final_recommendation without executed_queries (standard single-platform optimization).");
           }
           
           // Handle graph suggestions
           handleGraphSuggestions(recommendationGraphSuggestions);

           setCurrentStatus(null); 
           setIsProcessing(false); 
           break;

        case 'query_result':
          // This handles the raw data for the right-hand pane (tables)
          // For general insight, this will show intermediate Google/Facebook results before final_insight combines them.
          const queryResultData: QueryResult = {
            objective: lastJsonMessage.objective || 'Unknown Objective',
            query: lastJsonMessage.query || 'Unknown Query',
            dataframe: lastJsonMessage.data || [], 
            error: lastJsonMessage.error,
            platform: lastJsonMessage.platform, // Capture platform if sent
          };
          console.log("[useChat] Processing query_result:", queryResultData);
          setQueryResults(prev => {
              const exists = prev.some(qr => qr.objective === queryResultData.objective && qr.query === queryResultData.query && qr.platform === queryResultData.platform);
              if (!exists) {
                  const newState = [...prev, queryResultData];
                  return newState;
              }
              return prev;
          });
          break;

        case 'routing_decision':
            console.log('Routing decision:', lastJsonMessage);
            break;

        case 'error':
          const errorMsg = `**Error (${step || 'Unknown Step'}):** ${lastJsonMessage.message}${lastJsonMessage.details ? `\\n\\\`\\\`\\\`\\n${lastJsonMessage.details}\\\`\\\`\\\`` : ''}`;
          addMessageToChat('system', errorMsg);
          setCurrentStatus(null); 
          setIsProcessing(false);
          break;

        default:
          console.warn('Received unknown WebSocket message type:', type);
      }
    }
  }, [lastJsonMessage]);

  // Helper to parse user message for display context and actual query
  const parseUserMessageWithContext = (message: string): { userMessageContent: string, contextMessageToAdd: ChatMessage | null } => {
    let userMessageContent = message;
    let contextMessageToAdd: ChatMessage | null = null;
    const displayContextStartMarker = "---DISPLAY_CONTEXT START---";
    const displayContextEndMarker = "---DISPLAY_CONTEXT END---";
    const queryStartMarker = "---QUERY START---";

    if (message.includes(displayContextStartMarker) && message.includes(queryStartMarker)) {
      try {
        const queryStartIndex = message.indexOf(queryStartMarker) + queryStartMarker.length;
        userMessageContent = message.substring(queryStartIndex).trim();
        const displayContextStartIndex = message.indexOf(displayContextStartMarker) + displayContextStartMarker.length;
        const displayContextEndIndex = message.indexOf(displayContextEndMarker, displayContextStartIndex);

        if (displayContextEndIndex !== -1 && displayContextEndIndex > displayContextStartIndex) {
          const displayContextString = message.substring(displayContextStartIndex, displayContextEndIndex).trim();
          if (displayContextString) {
            contextMessageToAdd = {
              id: generateId(),
              role: 'context_info',
              content: displayContextString
            };
          }
        } else {
          console.warn("Couldn't find display context markers or context was empty.");
        }
      } catch (e) {
        console.error("Error parsing context/query message:", e);
        // Reset to original message if parsing fails, contextMessageToAdd remains null
        userMessageContent = message;
        contextMessageToAdd = null;
      }
    }
    return { userMessageContent, contextMessageToAdd };
  };

  const sendMessage = useCallback(async (message: string) => {
    if (readyState !== ReadyState.OPEN) {
      console.error('Cannot send message, WebSocket is not open.');
      addMessageToChat('system', 'Error: Cannot connect to assistant. Backend connection is closed.');
      setIsProcessing(false); 
      return;
    }

    if (!userId) {
      console.error('Cannot send message, user ID not yet received from WebSocket.');
      addMessageToChat('system', 'Error: Connection established, but user ID not received yet. Please wait a moment and try again.');
      setIsProcessing(false);
      return;
    }
    
    if (!message.trim()) return; 
   
    const { userMessageContent, contextMessageToAdd } = parseUserMessageWithContext(message);

    setMessages(prev => {
        const newMessages: ChatMessage[] = [];
        if (contextMessageToAdd) {
            newMessages.push(contextMessageToAdd); 
        }
        newMessages.push({
            id: generateId(), 
            role: 'user',
            content: userMessageContent 
        });
        return [...prev, ...newMessages];
    });
    
    setQueryResults([]); 
    setGraphSuggestions([]); 
    setCurrentStatus('Thinking...'); 
    setIsProcessing(true);
    
    try {
      const response = await fetch('/api/frontend/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message, 
          userId: userId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
        console.error('Error response from /api/frontend/chat:', errorData);
        const errorContent = `Error sending message to agent: ${errorData.detail || errorData.error || response.statusText}`;
        addMessageToChat('system', errorContent);
        setCurrentStatus(null);
        setIsProcessing(false);
      } else {
        const agentAckData = await response.json(); 
        console.log("Agent acknowledgement:", agentAckData);
        
        if (agentAckData.response) {
            addMessageToChat('assistant', agentAckData.response);
        }

        if (agentAckData.tool_called) {
            setCurrentStatus('Agent processing workflow...'); 
        } else {
            setCurrentStatus(null);
            setIsProcessing(false);
        }
      }
    } catch (error: unknown) { 
      console.error('Failed to fetch /api/frontend/chat:', error);
      let errorText = 'Network error connecting to the agent.';
      if (error instanceof Error) {
        errorText = error.message;
      }
      addMessageToChat('system', `Error: ${errorText}`);
      setCurrentStatus(null);
      setIsProcessing(false);
    }

  }, [readyState, userId]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  return {
    messages,
    queryResults,
    currentStatus,
    isProcessing,
    graphSuggestions,
    sendMessage,
    connectionStatus,
    userId,
    readyState,
  };
}
