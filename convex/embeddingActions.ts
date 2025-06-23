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

// Define a new validator for the slimmer article structure returned by the search tool
export const SlimArticleDataValidator = v.object({
  _id: v.id("articles"), // Keep ID for potential reference
  title: v.string(),
  content: v.string(), // Or a snippet/summary if full content is too large
  subtitle: v.optional(v.string()), // Assuming subtitle can be optional or sometimes empty
  link: v.string(),
  reconstructedLink: v.optional(v.string()),
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

// --- Internal Action to search for similar articles (for agent use) ---
export const searchSimilarArticlesInternal = internalAction({
  args: {
    searchQuery: v.string(),
    filterChannel: v.optional(v.string()),
    filterStatus: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(SlimArticleDataValidator),
  handler: async (ctx, args): Promise<({ _id: Id<"articles">, title: string, content: string, subtitle?: string, link: string, reconstructedLink?: string })[]> => {
    // console.log("[searchSimilarArticlesInternal] Received args:", JSON.stringify(args));

    // 1. Generate embedding for the search query
    let queryEmbedding;
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: args.searchQuery,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      if (!queryEmbedding) {
        console.error("[searchSimilarArticlesInternal] Failed to generate query embedding, response did not contain embedding.");
        throw new Error("Failed to generate query embedding.");
      }
      // console.log("[searchSimilarArticlesInternal] Query embedding generated successfully.");
    } catch (error) {
      console.error("[searchSimilarArticlesInternal] Error generating query embedding:", error);
      return [];
    }

    // 2. Prepare filter for vectorSearch
    let channelIdForFilter: number | null = null;
    if (args.filterChannel) {
      // console.log(`[searchSimilarArticlesInternal] Attempting to find channel_id for slug: "${args.filterChannel}"`);
      try {
        channelIdForFilter = await ctx.runQuery(api.channels.getChannelOriginalIdBySlug, { slug: args.filterChannel });
        if (channelIdForFilter === null) {
          console.warn(`[searchSimilarArticlesInternal] Channel slug "${args.filterChannel}" not found. No articles will be returned for this channel filter.`);
        } else {
          // console.log(`[searchSimilarArticlesInternal] Found channel_id: ${channelIdForFilter} for slug: "${args.filterChannel}"`);
        }
      } catch (e) {
        console.error(`[searchSimilarArticlesInternal] Error fetching original_id for channel slug ${args.filterChannel}:`, e);
      }
    }

    let filterExpression = undefined;

    if (channelIdForFilter !== null && args.filterStatus) {
      const statusAsString = String(args.filterStatus);
      const statusAsNumber = parseInt(statusAsString, 10);

      if (!isNaN(statusAsNumber)) {
        // console.log(`[searchSimilarArticlesInternal] Applying filters for channel_id: ${channelIdForFilter} AND status: ${statusAsNumber}`);
        filterExpression = (q: any) => q.and(
          q.eq("channel", channelIdForFilter!),
          q.eq("status", statusAsNumber)
        );
      } else if (channelIdForFilter !== null) {
        // console.log(`[searchSimilarArticlesInternal] Applying filter ONLY for channel_id: ${channelIdForFilter} (status filter '${args.filterStatus}' was invalid or not provided)`);
        filterExpression = (q: any) => q.eq("channel", channelIdForFilter!);
      } else {
        // console.warn(`[searchSimilarArticlesInternal] Invalid status '${args.filterStatus}' provided and no channel filter. No status filter applied.`);
      }
    } else if (channelIdForFilter !== null) {
      // console.log(`[searchSimilarArticlesInternal] Applying filter ONLY for channel_id: ${channelIdForFilter}`);
      filterExpression = (q: any) => q.eq("channel", channelIdForFilter!);
    } else if (args.filterStatus) {
      const statusAsString = String(args.filterStatus);
      const statusAsNumber = parseInt(statusAsString, 10);
      if (!isNaN(statusAsNumber)) {
        // console.log(`[searchSimilarArticlesInternal] Applying filter ONLY for status: ${statusAsNumber}`);
        filterExpression = (q: any) => q.eq("status", statusAsNumber);
      } else {
        // console.warn(`[searchSimilarArticlesInternal] Invalid status '${args.filterStatus}' provided. No status filter applied.`);
      }
    }

    // console.log("[searchSimilarArticlesInternal] Constructed filterExpression:", filterExpression ? "Expression defined" : "undefined");

    // 3. Perform vector search
    let searchResults;
    try {
      searchResults = await ctx.vectorSearch(
        "articles",
        "by_embedding",
        {
          vector: queryEmbedding,
          limit: args.limit ?? 10,
          filter: filterExpression,
        }
      );
      // console.log("[searchSimilarArticlesInternal] Vector search results:", JSON.stringify(searchResults));
    } catch (e) {
      console.error("[searchSimilarArticlesInternal] Error during vector search:", e);
      return [];
    }

    // 4. Extract IDs
    const ids = searchResults.map((result) => result._id);
    // console.log("[searchSimilarArticlesInternal] Extracted IDs from search results:", JSON.stringify(ids));
    if (ids.length === 0) {
      // console.log("[searchSimilarArticlesInternal] No IDs found after vector search, returning empty array.");
      return [];
    }

    // 5. Fetch full documents
    let fullDocuments: Doc<"articles">[] = [];
    try {
      fullDocuments = await ctx.runQuery(internal.articles.fetchArticleDataByIds, { ids });
      // console.log("[searchSimilarArticlesInternal] Fetched full documents:", JSON.stringify(fullDocuments.map(d => ({ _id: d._id, title: d.title, channel: d.channel, status: d.status }))));
    } catch (e) {
      console.error("[searchSimilarArticlesInternal] Error fetching full documents by IDs:", e);
      return []; // If fetching documents fails, return empty
    }

    if (fullDocuments.length === 0) {
      // console.log("[searchSimilarArticlesInternal] No full documents found for the extracted IDs, returning empty array.");
      return [];
    }

    // Map to the slimmer structure
    const slimDocuments = await Promise.all(fullDocuments.map(async (doc) => {
      let articleLink = `advisorpedia.com/${doc.link}`;
      let channelSlugForLink: string | null = null;
      if (doc.channel !== null && doc.channel !== undefined) {
        try {
          channelSlugForLink = await ctx.runQuery(api.channels.getChannelSlugByChannelOriginalId, { channelOriginalId: doc.channel });
          if (channelSlugForLink) {
            articleLink = `advisorpedia.com/${channelSlugForLink}/${doc.link}`;
          }
        } catch (e) {
          console.warn(`Failed to get channel slug for channel original_id ${doc.channel} for article ${doc._id}:`, e);
          // Fallback to the simpler link if channel slug fetch fails
        }
      }

      return {
        _id: doc._id,
        title: doc.title,
        content: doc.content + `\n\n(Source: ${articleLink})`, // Append constructed link to content
        subtitle: doc.subtitle || undefined,
        link: doc.link, // Keep original link field as well
        reconstructedLink: articleLink,
      };
    }));

    return slimDocuments;
  },
});

// --- Internal Action to search for sponsored contributor articles ---
export const searchSponsoredContributorArticles = internalAction({
  args: {
    searchQuery: v.string(),
    contributorIds: v.array(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(SlimArticleDataValidator),
  handler: async (ctx, args): Promise<({ _id: Id<"articles">, title: string, content: string, subtitle?: string, link: string, reconstructedLink?: string })[]> => {
    console.log("[searchSponsoredContributorArticles] Received args:", JSON.stringify(args));

    if (!args.contributorIds || args.contributorIds.length === 0) {
      console.log("[searchSponsoredContributorArticles] No contributor IDs provided, returning empty array.");
      return [];
    }

    // 1. Get all articles from the specified contributors
    let contributorArticles: Doc<"articles">[] = [];
    try {
      contributorArticles = await ctx.runQuery(api.articles.getByMultipleAuthorIds, {
        author_ids: args.contributorIds
      });
      console.log(`[searchSponsoredContributorArticles] Found ${contributorArticles.length} articles from ${args.contributorIds.length} contributors.`);
    } catch (e) {
      console.error("[searchSponsoredContributorArticles] Error fetching contributor articles:", e);
      return [];
    }

    if (contributorArticles.length === 0) {
      console.log("[searchSponsoredContributorArticles] No articles found for the specified contributors.");
      return [];
    }

    // 2. Generate embedding for the search query
    let queryEmbedding;
    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: args.searchQuery,
      });
      queryEmbedding = embeddingResponse.data[0].embedding;
      if (!queryEmbedding) {
        console.error("[searchSponsoredContributorArticles] Failed to generate query embedding.");
        throw new Error("Failed to generate query embedding.");
      }
      console.log("[searchSponsoredContributorArticles] Query embedding generated successfully.");
    } catch (error) {
      console.error("[searchSponsoredContributorArticles] Error generating query embedding:", error);
      return [];
    }

    // 3. Calculate similarity scores for each contributor article
    const articlesWithScores = contributorArticles
      .filter(article => article.embedding && article.embedding.length > 0) // Only articles with embeddings
      .map(article => {
        // Calculate cosine similarity
        const dotProduct = queryEmbedding.reduce((sum: number, val: number, i: number) =>
          sum + val * article.embedding![i], 0);
        const queryMagnitude = Math.sqrt(queryEmbedding.reduce((sum: number, val: number) =>
          sum + val * val, 0));
        const articleMagnitude = Math.sqrt(article.embedding!.reduce((sum: number, val: number) =>
          sum + val * val, 0));

        const similarity = dotProduct / (queryMagnitude * articleMagnitude);

        return {
          article,
          similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity) // Sort by similarity descending
      .slice(0, args.limit ?? 3); // Take top N (default 3)

    console.log(`[searchSponsoredContributorArticles] Ranked ${articlesWithScores.length} articles by similarity.`);

    // 4. Map to the slimmer structure with reconstructed links
    const slimDocuments = await Promise.all(articlesWithScores.map(async ({ article }) => {
      let articleLink = `advisorpedia.com/${article.link}`;
      let channelSlugForLink: string | null = null;
      if (article.channel !== null && article.channel !== undefined) {
        try {
          channelSlugForLink = await ctx.runQuery(api.channels.getChannelSlugByChannelOriginalId, { channelOriginalId: article.channel });
          if (channelSlugForLink) {
            articleLink = `advisorpedia.com/${channelSlugForLink}/${article.link}`;
          }
        } catch (e) {
          console.warn(`Failed to get channel slug for channel original_id ${article.channel} for article ${article._id}:`, e);
          // Fallback to the simpler link if channel slug fetch fails
        }
      }

      return {
        _id: article._id,
        title: article.title,
        content: article.content + `\n\n(Source: ${articleLink})`, // Append constructed link to content
        subtitle: article.subtitle || undefined,
        link: article.link, // Keep original link field as well
        reconstructedLink: articleLink,
      };
    }));

    return slimDocuments;
  },
});

