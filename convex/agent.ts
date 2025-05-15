"use node";

import { v } from "convex/values";
import { Agent, createTool } from "@convex-dev/agent";
import { internal, components } from "./_generated/api";
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
  filterChannel: z.optional(z.string()).describe("Optional channel to filter articles by."),
  filterStatus: z.optional(z.string()).describe("Optional status to filter articles by."),
  limit: z.optional(z.number()).describe("Optional limit for the number of articles to return."),
});

export const articleAgent = new Agent(components.agent, {
  chat: openai.chat("gpt-4.1-2025-04-14"),
  textEmbedding: openai.embedding("text-embedding-3-small"),

  instructions:
    "You are an AI assistant specialized in answering questions based on a knowledge base of articles. " +
    "When a user asks a question, your primary goal is to find the most relevant articles using the 'searchArticlesTool'. " +
    "Once you have retrieved relevant articles, synthesize the information from these articles to provide a comprehensive answer. " +
    "If you use information from articles, briefly mention the source or title. " +
    "If no relevant articles are found after using the tool, clearly state that you couldn't find specific information in the knowledge base. " +
    "Do not make up information if it's not found in the articles. " +
    "Be polite and helpful.",

  tools: {
    searchArticlesTool: createTool({
      description: "Searches and retrieves relevant articles from the knowledge base based on a user's query or keywords. Use this tool to find information for answering user questions.",
      args: searchToolArgsSchema,
      handler: async (ctx, args): Promise<({ _id: Id<"articles">, title: string, content: string, subtitle?: string, link: string })[]> => {
        const validatedArgs = searchToolArgsSchema.parse(args);
        return await ctx.runAction(internal.embeddingActions.searchSimilarArticlesInternal, validatedArgs);
      },
    }),
  },
  contextOptions: {
    searchOptions: {
      vectorSearch: true,
      limit: 2,
    },
    recentMessages: 1,
    includeToolCalls: false,
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
    threadId: v.string(),
    prompt: v.string(),
    userId: v.optional(v.id("users")),
  },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, args) => {
    const { thread } = await articleAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId: args.userId,
    });

    const agentResponse = await thread.generateText({
      prompt: args.prompt,
    });
    return { text: agentResponse.text };
  },
}); 