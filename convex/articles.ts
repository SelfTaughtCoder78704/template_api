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
  strapi_document_id: v.optional(v.string()), // For tracking Strapi articles across publish/unpublish cycles
});

export const get = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("articles")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// Legacy function that returns all articles (not recommended)
export const getAll = query({
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
    strapi_document_id: v.optional(v.string()),
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

// Get articles by multiple contributor original_ids (for sponsored contributor search)
export const getByMultipleAuthorIds = query({
  args: { author_ids: v.array(v.number()) },
  handler: async (ctx, args) => {
    const articles: Doc<"articles">[] = [];

    // Fetch articles for each contributor original_id
    for (const authorId of args.author_ids) {
      const contributorArticles = await ctx.db.query("articles")
        .withIndex("by_author_id", (q) => q.eq("author_id", authorId))
        .collect();

      articles.push(...contributorArticles);
    }

    return articles;
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
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("articles")
      .withIndex("by_embedding_status", (q) => q.eq("embedding", undefined))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// fix missing embeddings
export const fixMissingEmbeddings = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    total: v.number(),
    message: v.string(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    // Get a paginated batch of articles with missing embeddings
    const batchSize = args.limit ?? 50; // Process 50 articles at a time by default

    // Use pagination to get a batch of articles with missing embeddings
    const articlesPage = await ctx.db.query("articles")
      .withIndex("by_embedding_status", (q) => q.eq("embedding", undefined))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: batchSize
      });

    const articlesToFix = articlesPage.page;
    // We can't get an exact count easily, so we'll report on the current batch
    // and let the client know if there are more via isDone

    if (articlesToFix.length === 0) {
      return {
        processed: 0,
        total: 0,
        message: "No more articles found with missing embeddings.",
        isDone: true,
        continueCursor: null
      };
    }

    let fixedCount = 0;
    for (const article of articlesToFix) {
      const title = article.title;
      const content = article.content;
      const subtitle = article.subtitle;
      const link = article.link;

      if (article._id && title && content) {
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

    const resultMessage = `Processed batch: Scheduled embedding generation for ${fixedCount} out of ${articlesToFix.length} articles.`;
    console.log(resultMessage);

    return {
      processed: fixedCount,
      total: articlesToFix.length,
      message: resultMessage,
      isDone: articlesPage.isDone,
      continueCursor: articlesPage.continueCursor
    };
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

// Query to fetch articles by their IDs
export const getArticlesByIds = query({
  args: {
    articleIds: v.array(v.id("articles"))
  },
  returns: v.array(ArticleDocValidator),
  handler: async (ctx, args): Promise<Doc<"articles">[]> => {
    // Reuse our internal query to fetch the articles by IDs
    return await ctx.runQuery(internal.articles.fetchArticleDataByIds, {
      ids: args.articleIds
    });
  },
});

// Query to fetch articles by their original_ids
export const getArticlesByOriginalIds = query({
  args: {
    originalIds: v.array(v.number())
  },
  returns: v.array(ArticleDocValidator),
  handler: async (ctx, args): Promise<Doc<"articles">[]> => {
    const articles: Doc<"articles">[] = [];

    // Fetch each article by original_id using the index
    for (const originalId of args.originalIds) {
      const article = await ctx.db.query("articles")
        .withIndex("by_original_id", (q) => q.eq("original_id", originalId))
        .unique();

      if (article) {
        articles.push(article);
      }
    }

    return articles;
  },
});

// Query to get article by Strapi document ID
export const getByDocumentId = query({
  args: { documentId: v.string() },
  returns: v.union(ArticleDocValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<"articles"> | null> => {
    return await ctx.db.query("articles")
      .withIndex("by_strapi_document_id", (q) => q.eq("strapi_document_id", args.documentId))
      .first();
  },
});

// Mutation to update an existing article (for Strapi webhook updates)
export const updateArticle = mutation({
  args: {
    articleId: v.id("articles"),
    original_id: v.union(v.number(), v.null()),
    title: v.string(),
    link: v.string(),
    content: v.string(),
    subtitle: v.string(),
    channel: v.union(v.number(), v.null()),
    author_wpid: v.union(v.number(), v.null()),
    author_id: v.union(v.number(), v.null()),
    sponsored_position: v.union(v.number(), v.null()),
    rss_include: v.union(v.number(), v.null()),
    podcast_rss_include: v.union(v.number(), v.null()),
    placefilter: v.union(v.number(), v.null()),
    status: v.union(v.number(), v.null()),
    publish_date: v.string(),
    last_updated: v.string(),
    image_url: v.union(v.string(), v.null()),
    seo_meta: v.string(),
    source_link: v.union(v.string(), v.null()),
    video_url: v.union(v.string(), v.null()),
    video_title: v.union(v.string(), v.null()),
    audio_url: v.union(v.string(), v.null()),
    audio_file: v.union(v.string(), v.null()),
    transcript: v.union(v.string(), v.null()),
    white_paper_pdf: v.union(v.string(), v.null()),
    chart_url: v.union(v.string(), v.null()),
    fresh_finance_category: v.union(v.string(), v.null()),
    other: v.string(),
    other_meta: v.string(),
    channel_url: v.union(v.number(), v.null()),
    secondary_channel: v.union(v.number(), v.null()),
    secondary_channel_url: v.union(v.number(), v.null()),
    toolset_associations_contributor_post: v.union(v.string(), v.null()),
    wpcf_publishdate: v.union(v.number(), v.null()),
    strapi_document_id: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Update the article with new data
    await ctx.db.patch(args.articleId, {
      original_id: args.original_id,
      title: args.title,
      link: args.link,
      content: args.content,
      subtitle: args.subtitle,
      channel: args.channel,
      author_wpid: args.author_wpid,
      author_id: args.author_id,
      sponsored_position: args.sponsored_position,
      rss_include: args.rss_include,
      podcast_rss_include: args.podcast_rss_include,
      placefilter: args.placefilter,
      status: args.status,
      publish_date: args.publish_date,
      last_updated: args.last_updated,
      image_url: args.image_url,
      seo_meta: args.seo_meta,
      source_link: args.source_link,
      video_url: args.video_url,
      video_title: args.video_title,
      audio_url: args.audio_url,
      audio_file: args.audio_file,
      transcript: args.transcript,
      white_paper_pdf: args.white_paper_pdf,
      chart_url: args.chart_url,
      fresh_finance_category: args.fresh_finance_category,
      other: args.other,
      other_meta: args.other_meta,
      channel_url: args.channel_url,
      secondary_channel: args.secondary_channel,
      secondary_channel_url: args.secondary_channel_url,
      toolset_associations_contributor_post: args.toolset_associations_contributor_post,
      wpcf_publishdate: args.wpcf_publishdate,
      strapi_document_id: args.strapi_document_id,
    });

    // Regenerate embedding for updated content
    let textToEmbed = (args.title || "") + "\n\n" + (args.content || "") + "\n\n" + (args.subtitle || "") + "\n\n" + (args.link || "");
    if (textToEmbed.length > MAX_EMBEDDING_TEXT_CHARS) {
      textToEmbed = textToEmbed.substring(0, MAX_EMBEDDING_TEXT_CHARS);
      console.warn(`Article ${args.articleId}: Truncated textToEmbed to ${MAX_EMBEDDING_TEXT_CHARS} chars.`);
    }

    await ctx.scheduler.runAfter(0, internal.embeddingActions.generateEmbeddingAndUpdate, {
      articleId: args.articleId,
      textToEmbed: textToEmbed,
    });

    return null;
  },
});


