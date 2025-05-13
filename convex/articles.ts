import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

// Define a validator for the full article document structure
export const ArticleDocValidator = v.object({
  _id: v.id("articles"),
  _creationTime: v.number(),
  author: v.string(),
  sponsored_position: v.string(),
  title: v.string(),
  link_slug: v.string(),
  link_preview: v.string(),
  source_link: v.optional(v.string()),
  content: v.string(),
  channel: v.string(),
  secondary_channel: v.optional(v.string()),
  publish_date: v.string(),
  publish_time: v.string(),
  image: v.optional(v.string()),
  chart_image: v.optional(v.string()),
  video_url: v.optional(v.string()),
  video_title: v.optional(v.string()),
  audio_url: v.optional(v.string()),
  audio_file: v.optional(v.string()),
  transcript: v.optional(v.string()),
  white_paper_pdf: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  placefilter: v.string(),
  include_in_article_rss: v.boolean(),
  include_in_podcast_rss: v.string(),
  fresh_finance_category: v.optional(v.string()),
  status: v.string(),
  last_updated: v.string(),
  embedding: v.optional(v.array(v.float64())),
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("articles").collect();
  },
});

export const createArticle = mutation({
  args: {
    author: v.string(),
    sponsored_position: v.string(),
    title: v.string(),
    link_slug: v.string(),
    link_preview: v.string(),
    source_link: v.optional(v.string()),
    content: v.string(),
    channel: v.string(),
    secondary_channel: v.optional(v.string()),
    publish_date: v.string(),
    publish_time: v.string(),
    image: v.optional(v.string()),
    chart_image: v.optional(v.string()),
    video_url: v.optional(v.string()),
    video_title: v.optional(v.string()),
    audio_url: v.optional(v.string()),
    audio_file: v.optional(v.string()),
    transcript: v.optional(v.string()),
    white_paper_pdf: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    placefilter: v.string(),
    include_in_article_rss: v.boolean(),
    include_in_podcast_rss: v.string(),
    fresh_finance_category: v.optional(v.string()),
    status: v.string(),
    last_updated: v.string(),
    embedding: v.optional(v.array(v.float64())),
  },
  returns: v.id("articles"),
  handler: async (ctx, args) => {
    const articleId = await ctx.db.insert("articles", args);

    await ctx.scheduler.runAfter(0, internal.embeddingActions.generateEmbeddingAndUpdate, {
      articleId: articleId,
      textToEmbed: args.title + "\n\n" + args.content,
    });

    return articleId;
  },
});

// Internal Mutation to store the embedding (moved back here)
export const updateArticleEmbedding = internalMutation({
  args: {
    articleId: v.id("articles"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.articleId, { embedding: args.embedding });
  },
});

// --- New Internal Query to fetch full documents by ID ---
export const fetchArticleDataByIds = internalQuery({
  args: { ids: v.array(v.id("articles")) },
  returns: v.array(ArticleDocValidator),
  handler: async (ctx, args) => {
    const documents: Doc<"articles">[] = [];
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc !== null) {
        documents.push(doc);
      }
    }
    return documents;
  },
});
