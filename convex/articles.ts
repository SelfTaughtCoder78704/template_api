import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const MAX_EMBEDDING_TEXT_CHARS = 17000; // Define max characters for embedding input

// Define a validator for the full article document structure
export const ArticleDocValidator = v.object({
  _id: v.id("articles"),
  _creationTime: v.number(),

  original_id: v.union(v.number(), v.null()),
  author_wpid: v.union(v.number(), v.null()),
  sponsored_position: v.union(v.number(), v.null()),
  title: v.string(),
  link: v.string(),
  source_link: v.union(v.string(), v.null()),
  content: v.string(),
  channel: v.union(v.number(), v.null()),
  channel_url: v.union(v.number(), v.null()),
  secondary_channel: v.union(v.number(), v.null()),
  secondary_channel_url: v.union(v.number(), v.null()),
  publish_date: v.string(),
  last_updated: v.string(),
  image_url: v.union(v.string(), v.null()),
  seo_meta: v.string(),
  video_url: v.union(v.string(), v.null()),
  video_title: v.union(v.string(), v.null()),
  audio_url: v.union(v.string(), v.null()),
  audio_file: v.union(v.string(), v.null()),
  transcript: v.union(v.string(), v.null()),
  white_paper_pdf: v.union(v.string(), v.null()),
  subtitle: v.string(),
  placefilter: v.union(v.number(), v.null()),
  rss_include: v.union(v.number(), v.null()),
  podcast_rss_include: v.union(v.number(), v.null()),
  fresh_finance_category: v.union(v.string(), v.null()),
  status: v.union(v.number(), v.null()),
  chart_url: v.union(v.string(), v.null()),
  other: v.string(),
  other_meta: v.string(),
  toolset_associations_contributor_post: v.union(v.string(), v.null()),
  wpcf_publishdate: v.union(v.number(), v.null()),
  author_id: v.union(v.number(), v.null()),
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
    original_id: v.union(v.number(), v.null()),
    author_wpid: v.union(v.number(), v.null()),
    sponsored_position: v.union(v.number(), v.null()),
    title: v.string(),
    link: v.string(),
    source_link: v.union(v.string(), v.null()),
    content: v.string(),
    channel: v.union(v.number(), v.null()),
    channel_url: v.union(v.number(), v.null()),
    secondary_channel: v.union(v.number(), v.null()),
    secondary_channel_url: v.union(v.number(), v.null()),
    publish_date: v.string(),
    last_updated: v.string(),
    image_url: v.union(v.string(), v.null()),
    seo_meta: v.string(),
    video_url: v.union(v.string(), v.null()),
    video_title: v.union(v.string(), v.null()),
    audio_url: v.union(v.string(), v.null()),
    audio_file: v.union(v.string(), v.null()),
    transcript: v.union(v.string(), v.null()),
    white_paper_pdf: v.union(v.string(), v.null()),
    subtitle: v.string(),
    placefilter: v.union(v.number(), v.null()),
    rss_include: v.union(v.number(), v.null()),
    podcast_rss_include: v.union(v.number(), v.null()),
    fresh_finance_category: v.union(v.string(), v.null()),
    status: v.union(v.number(), v.null()),
    chart_url: v.union(v.string(), v.null()),
    other: v.string(),
    other_meta: v.string(),
    toolset_associations_contributor_post: v.union(v.string(), v.null()),
    wpcf_publishdate: v.union(v.number(), v.null()),
    author_id: v.union(v.number(), v.null()),
  },
  returns: v.id("articles"),
  handler: async (ctx, args) => {
    const articleDataForInsert = { ...args, embedding: undefined };
    const articleId = await ctx.db.insert("articles", articleDataForInsert);

    let textToEmbed = (args.title || "") + "\n\n" + (args.content || "") + "\n\n" + (args.subtitle || "") + "\n\n" + (args.link || "");
    if (textToEmbed.length > MAX_EMBEDDING_TEXT_CHARS) {
      textToEmbed = textToEmbed.substring(0, MAX_EMBEDDING_TEXT_CHARS);
      console.warn(`Article ${articleId}: Truncated textToEmbed to ${MAX_EMBEDDING_TEXT_CHARS} chars.`);
    }

    await ctx.scheduler.runAfter(0, internal.embeddingActions.generateEmbeddingAndUpdate, {
      articleId: articleId,
      textToEmbed: textToEmbed,
    });

    return articleId;
  },
});

// should be able to get by author_wpid
export const getByAuthorWpid = query({
  args: { author_wpid: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("articles").filter((q) => q.eq(q.field("author_wpid"), args.author_wpid)).collect();
  },
});

// should be able to get by author_id
export const getByAuthorId = query({
  args: { author_id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("articles").filter((q) => q.eq(q.field("author_id"), args.author_id)).collect();
  },
});

// should be able to get by author_id and return the name field from the contributors table using getAuthorNameByAuthorId
export const getAuthorNameByAuthorId = query({
  args: { author_id: v.number() },
  handler: async (ctx, args) => {
    const author = await ctx.db.query("contributors").filter((q) => q.eq(q.field("original_id"), args.author_id)).first();
    return author?.name;
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
    // Doc<"articles">[] should be assignable to the type inferred by v.array(ArticleDocValidator)
    // if ArticleDocValidator accurately reflects the document structure including _id and _creationTime.
    return documents;
  },
});


// find articles with missing embeddings
export const findArticlesWithMissingEmbeddings = query({
  args: {},
  returns: v.array(ArticleDocValidator),
  handler: async (ctx) => {
    return await ctx.db.query("articles").filter((q) => q.eq(q.field("embedding"), undefined)).collect();
  },
});

// fix missing embeddings
export const fixMissingEmbeddings = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const articlesToFix: Doc<"articles">[] = await ctx.runQuery(api.articles.findArticlesWithMissingEmbeddings, {});

    if (articlesToFix.length === 0) {
      console.log("No articles found with missing embeddings.");
      return "No articles found with missing embeddings.";
    }

    let fixedCount = 0;
    for (const article of articlesToFix) {
      const title = article.title;
      const content = article.content;
      const subtitle = article.subtitle;
      const link = article.link;

      if (article._id && title && content && subtitle && link) {
        let textToEmbed = (title || "") + "\n\n" + (content || "") + "\n\n" + (subtitle || "") + "\n\n" + (link || "");
        if (textToEmbed.length > MAX_EMBEDDING_TEXT_CHARS) {
          textToEmbed = textToEmbed.substring(0, MAX_EMBEDDING_TEXT_CHARS);
          console.warn(`Fixing Article ${article._id}: Truncated textToEmbed to ${MAX_EMBEDDING_TEXT_CHARS} chars.`);
        }
        try {
          await ctx.scheduler.runAfter(0, internal.embeddingActions.generateEmbeddingAndUpdate, {
            articleId: article._id,
            textToEmbed: textToEmbed,
          });
          fixedCount++;
          console.log(`Scheduled embedding generation for article: ${article._id} (${title.substring(0, 30)}...)`);
        } catch (e) {
          console.error(`Error scheduling embedding for article ${article._id}:`, e);
        }
      } else {
        console.warn(`Skipping article due to missing critical fields for embedding: ${article._id} (Title: ${title ? title.substring(0, 30) : 'N/A'}...)`);
      }
    }
    const resultMessage: string = `Attempted to schedule embedding generation for ${fixedCount} out of ${articlesToFix.length} articles found with missing embeddings.`;
    console.log(resultMessage);
    return resultMessage;
  },
});

export const getByChannel = query({
  args: {
    channel: v.number(),
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("articles")
      .filter((q) => q.eq(q.field("channel"), args.channel))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: args.numItems ?? 20
      });
  },
});

export const getChannelSlugByArticleOriginalId = query({
  args: {
    original_id: v.number()
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    // Find the article by original_id using the index
    const article = await ctx.db.query("articles")
      .withIndex("by_original_id", (q) => q.eq("original_id", args.original_id))
      .first();

    if (!article || article.channel === null) {
      return null;
    }

    // Get the channel slug using the channels.channelSlug function
    const channelSlug: string | null = await ctx.runQuery(api.channels.channelSlug, {
      original_id: article.channel
    });

    return channelSlug;
  },
});

// Query to fetch a few articles by channel ID for inspection
export const getArticlesByChannelId = query({
  args: {
    channelId: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(ArticleDocValidator),
  handler: async (ctx, args) => {
    const articles = await ctx.db
      .query("articles")
      .withIndex("by_channel", (q) => q.eq("channel", args.channelId))
      .order("desc") // Get most recent first, or any order
      .take(args.limit ?? 3); // Default to 3 if limit not provided
    return articles;
  },
});


