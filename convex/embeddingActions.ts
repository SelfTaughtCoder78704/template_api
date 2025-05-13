"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { ArticleDocValidator } from "./articles";

// OpenAI client initialization
const openai = new OpenAI({
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

// Internal Action to generate and store embedding
export const generateEmbeddingAndUpdate = internalAction({
  args: {
    articleId: v.id("articles"),
    textToEmbed: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: args.textToEmbed,
      });

      const embedding = embeddingResponse.data[0].embedding;

      if (!embedding) {
        throw new Error("Failed to generate embedding.");
      }

      // Call the mutation, now located in articles.ts
      await ctx.runMutation(internal.articles.updateArticleEmbedding, {
        articleId: args.articleId,
        embedding: embedding,
      });
      console.log(`Embedding generated and stored for article ${args.articleId}`);

    } catch (error) {
      console.error(
        `Failed to generate or store embedding for article ${args.articleId}:`,
        error
      );
    }
  },
});

// --- New Public Action to search for similar articles ---
export const searchSimilarArticles = action({
  args: {
    searchQuery: v.string(),
    filterChannel: v.optional(v.string()),
    filterStatus: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ArticleDocValidator),
  handler: async (ctx, args): Promise<Doc<"articles">[]> => {
    // 1. Generate embedding for the search query
    let queryEmbedding;
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: args.searchQuery,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      if (!queryEmbedding) {
        throw new Error("Failed to generate query embedding.");
      }
    } catch (error) {
      console.error("Error generating query embedding:", error);
      return [];
    }

    // 2. Prepare filter for vectorSearch
    let filterExpression = undefined;
    if (args.filterChannel && args.filterStatus) {
      filterExpression = (q: any) => q.or(
        q.eq("channel", args.filterChannel!),
        q.eq("status", args.filterStatus!)
      );
    } else if (args.filterChannel) {
      filterExpression = (q: any) => q.eq("channel", args.filterChannel!);
    } else if (args.filterStatus) {
      filterExpression = (q: any) => q.eq("status", args.filterStatus!);
    }

    // 3. Perform vector search
    const searchResults = await ctx.vectorSearch(
      "articles",
      "by_embedding",
      {
        vector: queryEmbedding,
        limit: args.limit ?? 10,
        filter: filterExpression,
      }
    );

    // 4. Extract IDs
    const ids = searchResults.map((result) => result._id);
    if (ids.length === 0) {
      return [];
    }

    // 5. Fetch full documents
    const documents: Doc<"articles">[] = await ctx.runQuery(internal.articles.fetchArticleDataByIds, { ids });
    return documents;
  },
}); 

