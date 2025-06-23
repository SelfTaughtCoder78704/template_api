"use node";

import { v } from "convex/values";
import { Agent, createTool } from "@convex-dev/agent";
import { internal, components, api } from "./_generated/api";
import { action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { z } from "zod";

// Temporarily set OPENAI_API_KEY for @ai-sdk/openai if CONVEX_OPENAI_API_KEY is available
if (process.env.CONVEX_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.CONVEX_OPENAI_API_KEY;
}

if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GOOGLE_API_KEY) {
  process.env.GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

import { openai } from "@ai-sdk/openai";
import { google } from '@ai-sdk/google';
import { ArticleDocValidator } from "./articles";

// Define the Zod schema for the search tool arguments
const searchToolArgsSchema = z.object({
  searchQuery: z.string().describe("The user's query or keywords to search for relevant articles."),
  filterChannel: z.optional(z.string()).describe("If the user explicitly specifies a channel by its name or slug (e.g., 'in the X channel', 'from channel Y'), provide that channel name/slug here. Only use this if the user's intent to filter by a specific channel is very clear and unambiguous. If unsure, do not provide a value for this argument."),
  filterStatus: z.optional(z.string()).describe("Optional status to filter articles by."),
  limit: z.optional(z.number()).describe("Optional limit for the number of articles to return."),
});

export const articleAgent = new Agent(components.agent, {
  chat: google.chat("gemini-2.0-flash"),
  textEmbedding: openai.embedding("text-embedding-3-small"),

  instructions:
    "You are an AI assistant specialized in answering questions based on a knowledge base of articles. " +
    "When a user asks a question, you MUST use the 'searchArticlesTool' to find relevant articles. " +
    "Regarding the 'filterChannel' argument for the 'searchArticlesTool': " +
    "You should ONLY populate 'filterChannel' if the user explicitly and unambiguously states they want to filter by a specific channel. Examples of clear intent include phrases like: 'find articles in the [channel name] channel about X', 'what does the [channel name] channel say about Y?', or 'search [channel name] for Z'. " +
    "If the user's query mentions a topic that *could* also be a channel name but they do not explicitly frame it as a channel filter (e.g., 'tell me about family financial planning'), do NOT use the 'filterChannel' argument. " +
    "Be conservative: if there is any doubt about whether the user intends a channel filter, do NOT populate the 'filterChannel' argument and proceed with a broader search. " +
    "The 'searchArticlesTool' will provide 'title', 'content', and 'reconstructedLink' for each article. " +
    "In your textual response, synthesize information from the 'content' of the MOST relevant article(s) found. " +
    "When you use information from an article, clearly mention the article's 'title' and include its full 'reconstructedLink' (which is also embedded in the article's 'content' as \"(Source: URL)\") in your response. " +
    "Example: 'Based on the article \"Hyperloop Explained\" (Source: example.com/hyperloop-explained), the Hyperloop is a proposed mode of transportation...' " +
    "If the 'searchArticlesTool' returns no relevant articles, state that you couldn't find any information on that topic in the knowledge base. " +
    "Be polite and helpful.",

  usageHandler: async (ctx, args) => {
    const {
      // Who used the tokens
      userId, threadId, agentName,
      // What LLM was used
      model, provider,
      // How many tokens were used (extra info is available in providerMetadata)
      usage, providerMetadata
    } = args;

    // Log usage for monitoring
    console.log(`[Agent Usage] User: ${userId}, Thread: ${threadId}, Model: ${model}, Provider: ${provider}`);
    console.log(`[Agent Usage] Tokens - Prompt: ${usage.promptTokens}, Completion: ${usage.completionTokens}, Total: ${usage.totalTokens}`);

    // Log OpenAI-specific metadata if available
    if (providerMetadata?.openai) {
      const openaiMeta = providerMetadata.openai;
      if (openaiMeta.cachedPromptTokens !== undefined) {
        console.log(`[Agent Usage] Cached Prompt Tokens: ${openaiMeta.cachedPromptTokens}`);
      }
      if (openaiMeta.reasoningTokens !== undefined) {
        console.log(`[Agent Usage] Reasoning Tokens: ${openaiMeta.reasoningTokens}`);
      }
    }

    // TODO: Optionally save usage to a database table for billing/analytics
    // await ctx.runMutation(api.usage.logUsage, {
    //   userId,
    //   threadId,
    //   agentName,
    //   model,
    //   provider,
    //   promptTokens: usage.promptTokens,
    //   completionTokens: usage.completionTokens,
    //   totalTokens: usage.totalTokens,
    //   metadata: providerMetadata
    // });
  },

  tools: {
    searchArticlesTool: createTool({
      description: "Searches and retrieves relevant articles from the knowledge base based on a user's query or keywords. Use this tool to find information for answering user questions.",
      args: searchToolArgsSchema,
      handler: async (ctx, args): Promise<({ _id: Id<"articles">, title: string, content: string, subtitle?: string, link: string, reconstructedLink?: string })[]> => {
        console.log(`[searchArticlesTool] Tool called with args:`, JSON.stringify(args, null, 2));
        const validatedArgs = searchToolArgsSchema.parse(args);
        console.log(`[searchArticlesTool] Validated args:`, JSON.stringify(validatedArgs, null, 2));

        const toolResult = await ctx.runAction(internal.embeddingActions.searchSimilarArticlesInternal, validatedArgs);
        console.log(`[searchArticlesTool] Tool result count: ${toolResult?.length || 0}`);

        if (toolResult && toolResult.length > 0) {
          console.log(`[searchArticlesTool] First result title: "${toolResult[0].title}"`);
          console.log(`[searchArticlesToool] First result has reconstructedLink: ${!!toolResult[0].reconstructedLink}`);
        }

        return toolResult;
      },
    }),
  },
  contextOptions: {
    searchOptions: {
      vectorSearch: true,
      limit: 2,
    },
    recentMessages: 1,
    includeToolCalls: true,
  },
  storageOptions: {
    saveAnyInputMessages: true,
    saveOutputMessages: true,
  },
  maxSteps: 5,
});

// Public action to send a message to an agent thread
export const sendMessageToAgent = action({
  args: {
    threadId: v.optional(v.string()),
    prompt: v.string(),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({
    threadId: v.string(),
    responseText: v.string(),
    sources: v.optional(v.array(v.object({
      title: v.string(),
      link: v.string(),
      truncatedContent: v.string(),
    }))),
  }),
  handler: async (ctx, args): Promise<{
    threadId: string,
    responseText: string,
    sources?: { title: string, link: string, truncatedContent: string }[],
  }> => {
    console.log(`[sendMessageToAgent] Starting with prompt: "${args.prompt}"`);
    console.log(`[sendMessageToAgent] ThreadId provided: ${args.threadId || 'none'}`);

    let thread: any;
    let threadId: string;

    // If threadId is provided, try to continue existing thread
    if (args.threadId) {
      console.log(`[sendMessageToAgent] Continuing existing thread: ${args.threadId}`);
      const result: any = await articleAgent.continueThread(ctx, {
        threadId: args.threadId,
        userId: args.userId
      });
      thread = result.thread;
      threadId = args.threadId;
    } else {
      // No threadId provided, create a new thread
      console.log(`[sendMessageToAgent] Creating new thread`);
      const result: any = await articleAgent.createThread(ctx, {
        userId: args.userId,
        title: "New Article Agent Thread"
      });
      thread = result.thread;
      threadId = result.threadId;
      console.log(`[sendMessageToAgent] Created new thread with ID: ${threadId}`);
    }

    console.log(`[sendMessageToAgent] About to call thread.generateText with prompt`);
    const agentResponse: any = await thread.generateText({
      prompt: args.prompt,
    }, {
      contextOptions: {
        // Exclude tool messages to save space (they're often verbose)
        excludeToolMessages: false, // Keep tools for now since searchArticlesTool provides sources
        // Include more recent messages for better conversation flow
        recentMessages: 10, // Increased from global default of 1
        // Search options for finding relevant historical context
        searchOptions: {
          limit: 5, // Increased from global default of 2
          textSearch: true, // Enable text search for better context retrieval
          vectorSearch: true, // Keep vector search enabled
          // Get context around found messages
          messageRange: { before: 1, after: 1 },
        },
        // Don't search other threads (keep conversations isolated)
        searchOtherThreads: false,
      },
    });

    console.log(`[sendMessageToAgent] Agent response received`);
    console.log(`[sendMessageToAgent] Response text: "${agentResponse.text}"`);
    console.log(`[sendMessageToAgent] Agent response keys:`, Object.keys(agentResponse));

    // Log the full request structure for debugging
    if (agentResponse.request) {
      console.log(`[sendMessageToAgent] Request object keys:`, Object.keys(agentResponse.request));
      if (agentResponse.request.body) {
        console.log(`[sendMessageToAgent] Request body type:`, typeof agentResponse.request.body);
        console.log(`[sendMessageToAgent] Request body length:`, agentResponse.request.body.length);
      }
    }

    let sources: { title: string, link: string, truncatedContent: string }[] | undefined = undefined;

    // Extract sources information from tool calls
    try {
      if (agentResponse.request?.body && typeof agentResponse.request.body === 'string') {
        const requestBody = JSON.parse(agentResponse.request.body);
        console.log(`[sendMessageToAgent] Parsed request body keys:`, Object.keys(requestBody));

        // Handle both OpenAI format (messages) and Google format (contents)
        const messagesArray = requestBody?.messages || requestBody?.contents;

        if (messagesArray) {
          console.log(`[sendMessageToAgent] Found ${messagesArray.length} messages/contents in request body`);
          let lastSearchToolCallId: string | null = null;

          // Find the ID of the last call to searchArticlesTool made by the assistant
          for (let i = messagesArray.length - 1; i >= 0; i--) {
            const message = messagesArray[i];
            console.log(`[sendMessageToAgent] Message ${i}: role=${message.role}, has_tool_calls=${!!message.tool_calls}, has_parts=${!!message.parts}`);

            // Handle OpenAI format (tool_calls) and Google format (parts with functionCall)
            let toolCalls = message.tool_calls;
            if (!toolCalls && message.parts) {
              // Google format: look for functionCall in parts
              toolCalls = message.parts.filter((part: any) => part.functionCall).map((part: any) => ({
                type: 'function',
                id: part.functionCall.name + '_call', // Generate an ID since Google doesn't provide one
                function: { name: part.functionCall.name }
              }));
            }

            if (message.role === 'model' || message.role === 'assistant') {
              if (toolCalls && toolCalls.length > 0) {
                console.log(`[sendMessageToAgent] Assistant/model message has ${toolCalls.length} tool calls`);
                const searchToolCall = toolCalls.find((tc: any) =>
                  tc.type === 'function' &&
                  (tc.function?.name === 'searchArticlesTool' || tc.name === 'searchArticlesTool')
                );
                if (searchToolCall) {
                  lastSearchToolCallId = searchToolCall.id || 'searchArticlesTool_call';
                  console.log(`[sendMessageToAgent] Found searchArticlesTool call with ID: ${lastSearchToolCallId}`);
                  break;
                }
              }
            }
          }

          if (!lastSearchToolCallId) {
            console.log(`[sendMessageToAgent] No searchArticlesTool call found in messages`);
          }

          // If a call to searchArticlesTool was found, find its corresponding response
          if (lastSearchToolCallId) {
            console.log(`[sendMessageToAgent] Looking for tool response with ID: ${lastSearchToolCallId}`);
            for (let i = messagesArray.length - 1; i >= 0; i--) {
              const message = messagesArray[i];

              // Handle both OpenAI format (role: 'tool') and Google format (role: 'function' or parts with functionResponse)
              let isToolResponse = false;
              let toolContent = null;

              if (message.role === 'tool' && message.tool_call_id === lastSearchToolCallId) {
                // OpenAI format
                isToolResponse = true;
                toolContent = message.content;
              } else if (message.role === 'function' || message.role === 'user' && message.parts && message.parts.some((part: any) => part.functionResponse)) {
                // Google format - role can be 'user' for function responses
                console.log(`[sendMessageToAgent] Examining Google format message:`, JSON.stringify(message, null, 2));
                isToolResponse = true;
                const functionResponsePart = message.parts?.find((part: any) => part.functionResponse);
                console.log(`[sendMessageToAgent] Found function response part:`, JSON.stringify(functionResponsePart, null, 2));
                if (functionResponsePart) {
                  // Google format: the actual data is nested in functionResponse.response.content
                  const responseContent = functionResponsePart.functionResponse.response?.content;
                  if (responseContent) {
                    toolContent = JSON.stringify(responseContent);
                    console.log(`[sendMessageToAgent] Extracted tool content from response.content:`, toolContent);
                  } else {
                    // Fallback to the full response if content is not available
                    toolContent = JSON.stringify(functionResponsePart.functionResponse.response);
                    console.log(`[sendMessageToAgent] Extracted tool content from response (fallback):`, toolContent);
                  }
                }
              }

              if (isToolResponse && toolContent) {
                console.log(`[sendMessageToAgent] Found matching tool response message`);
                if (typeof toolContent === 'string') {
                  const toolResponseContent = JSON.parse(toolContent);
                  console.log(`[sendMessageToAgent] Tool response content is array: ${Array.isArray(toolResponseContent)}, length: ${toolResponseContent?.length || 0}`);

                  if (Array.isArray(toolResponseContent) && toolResponseContent.length > 0) {
                    sources = []; // Initialize as an empty array
                    for (const article of toolResponseContent) {
                      if (article && article.reconstructedLink && article.title) {
                        sources.push({
                          title: article.title,
                          link: article.reconstructedLink,
                          truncatedContent: article.content.substring(0, 300) + (article.content.length > 300 ? "..." : "")
                        });
                      }
                    }
                    if (sources.length > 0) {
                      console.log(`[sendMessageToAgent] Extracted ${sources.length} sources`);
                    } else {
                      sources = undefined; // Set back to undefined if no valid sources found
                    }
                    break; // Break from the messages loop once the relevant tool response is processed
                  }
                }
              }
            }
          }
        } else {
          console.log(`[sendMessageToAgent] No messages/contents found in request body`);
        }
      } else {
        console.log(`[sendMessageToAgent] No request body found or not a string`);
      }
    } catch (e) {
      console.error("[sendMessageToAgent] Error parsing tool call/response from agentResponse.request.body:", e);
    }

    console.log(`[sendMessageToAgent] Final sources count: ${sources?.length || 0}`);

    return {
      threadId: threadId,
      responseText: agentResponse.text ?? "",
      sources,
    };
  },
}); 