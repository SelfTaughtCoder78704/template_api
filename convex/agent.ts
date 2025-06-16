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

import { openai } from "@ai-sdk/openai";
import { ArticleDocValidator } from "./articles";

// Define the Zod schema for the search tool arguments
const searchToolArgsSchema = z.object({
  searchQuery: z.string().describe("The user's query or keywords to search for relevant articles."),
  filterChannel: z.optional(z.string()).describe("If the user explicitly specifies a channel by its name or slug (e.g., 'in the X channel', 'from channel Y'), provide that channel name/slug here. Only use this if the user's intent to filter by a specific channel is very clear and unambiguous. If unsure, do not provide a value for this argument."),
  filterStatus: z.optional(z.string()).describe("Optional status to filter articles by."),
  limit: z.optional(z.number()).describe("Optional limit for the number of articles to return."),
});

export const articleAgent = new Agent(components.agent, {
  chat: openai.chat("gpt-4.1-2025-04-14"),
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

  tools: {
    searchArticlesTool: createTool({
      description: "Searches and retrieves relevant articles from the knowledge base based on a user's query or keywords. Use this tool to find information for answering user questions.",
      args: searchToolArgsSchema,
      handler: async (ctx, args): Promise<({ _id: Id<"articles">, title: string, content: string, subtitle?: string, link: string, reconstructedLink?: string })[]> => {
        const validatedArgs = searchToolArgsSchema.parse(args);
        const toolResult = await ctx.runAction(internal.embeddingActions.searchSimilarArticlesInternal, validatedArgs);
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
    usage: v.optional(v.object({
      promptTokens: v.optional(v.number()),
      completionTokens: v.optional(v.number()),
      totalTokens: v.optional(v.number()),
      // OpenAI-specific metadata
      cachedPromptTokens: v.optional(v.number()),
      reasoningTokens: v.optional(v.number()),
      acceptedPredictionTokens: v.optional(v.number()),
      rejectedPredictionTokens: v.optional(v.number()),
    })),
  }),
  handler: async (ctx, args): Promise<{
    threadId: string,
    responseText: string,
    sources?: { title: string, link: string, truncatedContent: string }[],
    usage?: {
      promptTokens?: number,
      completionTokens?: number,
      totalTokens?: number,
      cachedPromptTokens?: number,
      reasoningTokens?: number,
      acceptedPredictionTokens?: number,
      rejectedPredictionTokens?: number,
    }
  }> => {
    let thread: any;
    let threadId: string;

    // If threadId is provided, try to continue existing thread
    if (args.threadId) {
      try {
        const result: any = await articleAgent.continueThread(ctx, {
          threadId: args.threadId,
          userId: args.userId
        });
        thread = result.thread;
        threadId = args.threadId;
      } catch (error) {
        // If continuing thread fails, create a new one
        console.log("Failed to continue thread, creating new one:", error);
        const newThreadId: string = await ctx.runMutation(api.threadMutations.createAgentThread, {
          userId: args.userId,
          title: "New Article Agent Thread"
        });
        const result: any = await articleAgent.continueThread(ctx, {
          threadId: newThreadId,
          userId: args.userId
        });
        thread = result.thread;
        threadId = newThreadId;
      }
    } else {
      // No threadId provided, create a new thread
      const newThreadId: string = await ctx.runMutation(api.threadMutations.createAgentThread, {
        userId: args.userId,
        title: "New Article Agent Thread"
      });
      const result: any = await articleAgent.continueThread(ctx, {
        threadId: newThreadId,
        userId: args.userId
      });
      thread = result.thread;
      threadId = newThreadId;
    }

    const agentResponse: any = await thread.generateText({
      prompt: args.prompt,
    });

    let sources: { title: string, link: string, truncatedContent: string }[] | undefined = undefined;
    let usage: {
      promptTokens?: number,
      completionTokens?: number,
      totalTokens?: number,
      cachedPromptTokens?: number,
      reasoningTokens?: number,
      acceptedPredictionTokens?: number,
      rejectedPredictionTokens?: number,
    } | undefined = undefined;

    // Extract usage information from agentResponse
    try {
      if (agentResponse.usage) {
        usage = {
          promptTokens: agentResponse.usage.promptTokens,
          completionTokens: agentResponse.usage.completionTokens,
          totalTokens: agentResponse.usage.totalTokens,
        };

        // Add OpenAI-specific metadata if available
        if (agentResponse.providerMetadata?.openai) {
          const openaiMetadata = agentResponse.providerMetadata.openai;
          if (openaiMetadata.cachedPromptTokens !== undefined) {
            usage.cachedPromptTokens = openaiMetadata.cachedPromptTokens;
          }
          if (openaiMetadata.reasoningTokens !== undefined) {
            usage.reasoningTokens = openaiMetadata.reasoningTokens;
          }
          if (openaiMetadata.acceptedPredictionTokens !== undefined) {
            usage.acceptedPredictionTokens = openaiMetadata.acceptedPredictionTokens;
          }
          if (openaiMetadata.rejectedPredictionTokens !== undefined) {
            usage.rejectedPredictionTokens = openaiMetadata.rejectedPredictionTokens;
          }
        }

        // Log usage for monitoring (can be removed in production)
        console.log(`[sendMessageToAgent] Token usage - Prompt: ${usage.promptTokens}, Completion: ${usage.completionTokens}, Total: ${usage.totalTokens}${usage.cachedPromptTokens ? `, Cached: ${usage.cachedPromptTokens}` : ''}${usage.reasoningTokens ? `, Reasoning: ${usage.reasoningTokens}` : ''}`);
      }
    } catch (e) {
      console.error("[sendMessageToAgent] Error extracting usage information:", e);
    }

    // Extract sources information (existing logic)
    try {
      if (agentResponse.request?.body && typeof agentResponse.request.body === 'string') {
        const requestBody = JSON.parse(agentResponse.request.body);
        if (requestBody?.messages) {
          const messages = requestBody.messages;
          let lastSearchToolCallId: string | null = null;

          // Find the ID of the last call to searchArticlesTool made by the assistant
          for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role === 'assistant' && message.tool_calls) {
              const searchToolCall = message.tool_calls.find((tc: any) => tc.type === 'function' && tc.function?.name === 'searchArticlesTool');
              if (searchToolCall) {
                lastSearchToolCallId = searchToolCall.id;
                break;
              }
            }
          }

          // If a call to searchArticlesTool was found, find its corresponding tool_response message
          if (lastSearchToolCallId) {
            for (let i = messages.length - 1; i >= 0; i--) {
              const message = messages[i];
              if (message.role === 'tool' && message.tool_call_id === lastSearchToolCallId) {
                if (typeof message.content === 'string') {
                  const toolResponseContent = JSON.parse(message.content);
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
                      // console.log(`[sendMessageToAgent] Extracted from agentResponse.request.body.messages: ${sources.length} sources`);
                    } else {
                      sources = undefined; // Set back to undefined if no valid sources found
                    }
                    break; // Break from the messages loop once the relevant tool response is processed
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("[sendMessageToAgent] Error parsing tool call/response from agentResponse.request.body.messages:", e);
    }

    return {
      threadId: threadId,
      responseText: agentResponse.text ?? "",
      sources,
      usage,
    };
  },
}); 