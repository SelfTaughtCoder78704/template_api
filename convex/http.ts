// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api"; // To call your queries/mutations
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// Example: An endpoint to get all articles
http.route({
  path: "/getArticles", // This will be accessible at https://<your-convex-url>/getArticles
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Handle CORS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Get pagination parameters from URL query params
    const url = new URL(request.url);
    const numItemsParam = url.searchParams.get("numItems");
    const cursorParam = url.searchParams.get("cursor");

    // Default to 50 items if not specified, cap at 100 for performance
    const numItems = numItemsParam ? Math.min(parseInt(numItemsParam, 10), 100) : 50;

    // Set up pagination options
    const paginationOpts = {
      numItems,
      cursor: cursorParam || null,
    };

    // You can call your existing query here
    const articlesPage = await ctx.runQuery(api.articles.get, { paginationOpts });

    return new Response(JSON.stringify(articlesPage), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      },
      status: 200,
    });
  }),
});

// Example: An endpoint that might take a POST request with a body
http.route({
  path: "/createArticle",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // --- API Key Authentication --- 
    const expectedApiKey = process.env.CREATE_ARTICLE_API_KEY;

    if (!expectedApiKey) {
      console.error("CRITICAL: CREATE_ARTICLE_API_KEY environment variable is not set.");
      return new Response(JSON.stringify({ error: "API authentication is not configured on the server." }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }

    const providedApiKey = request.headers.get("X-API-Key");

    if (!providedApiKey) {
      return new Response(JSON.stringify({ error: "API key is missing in X-API-Key header." }), {
        headers: { "Content-Type": "application/json" },
        status: 401, // Unauthorized
      });
    }

    if (providedApiKey !== expectedApiKey) {
      return new Response(JSON.stringify({ error: "Invalid API key." }), {
        headers: { "Content-Type": "application/json" },
        status: 403, // Forbidden
      });
    }
    // --- End API Key Authentication ---

    let body;
    try {
      body = await request.json(); // Assuming JSON body
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // --- Basic Validation --- 
    // You should expand this based on the actual v.object definition in your createArticle mutation
    const requiredFields = ["title", "content", "author", "channel", "status"];
    for (const field of requiredFields) {
      if (body[field] === undefined || typeof body[field] !== 'string') {
        return new Response(JSON.stringify({ error: `Missing or invalid type for required field: ${field}. Expected string.` }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        });
      }
    }

    // Ensure include_in_podcast_rss is a string, default to "None" if not provided or invalid
    let includeInPodcastRss = "None";
    if (body.include_in_podcast_rss !== undefined && typeof body.include_in_podcast_rss === 'string') {
      includeInPodcastRss = body.include_in_podcast_rss;
    } else if (body.include_in_podcast_rss !== undefined) {
      // If it's provided but not a string, you might want to log a warning or handle it differently
      console.warn("Invalid type for include_in_podcast_rss, defaulting to 'None'. Received:", body.include_in_podcast_rss);
    }

    const articleArgs = {
      title: body.title,
      content: body.content,
      status: typeof body.status === 'string' && !isNaN(Number(body.status)) ? Number(body.status) : null,
      channel: typeof body.channel === 'string' && !isNaN(Number(body.channel)) ? Number(body.channel) : null,

      // Required fields that were missing
      link: typeof body.link_slug === 'string' ? body.link_slug : "",
      original_id: null,
      author_wpid: null,
      sponsored_position: typeof body.sponsored_position === 'string' && !isNaN(Number(body.sponsored_position))
        ? Number(body.sponsored_position)
        : null,
      channel_url: null,
      secondary_channel: typeof body.secondary_channel === 'string' && !isNaN(Number(body.secondary_channel))
        ? Number(body.secondary_channel)
        : null,
      secondary_channel_url: null,
      publish_date: typeof body.publish_date === 'string' ? body.publish_date : new Date().toISOString().split('T')[0],
      last_updated: typeof body.last_updated === 'string' ? body.last_updated : new Date().toISOString(),
      image_url: typeof body.image === 'string' ? body.image : null,
      seo_meta: "",
      subtitle: typeof body.subtitle === 'string' ? body.subtitle : "",
      placefilter: typeof body.placefilter === 'string' && !isNaN(Number(body.placefilter))
        ? Number(body.placefilter)
        : null,
      rss_include: typeof body.include_in_article_rss === 'boolean' && body.include_in_article_rss ? 1 : 0,
      podcast_rss_include: typeof body.include_in_podcast_rss === 'string' && !isNaN(Number(body.include_in_podcast_rss))
        ? Number(body.include_in_podcast_rss)
        : 0,
      fresh_finance_category: typeof body.fresh_finance_category === 'string' ? body.fresh_finance_category : null,
      chart_url: typeof body.chart_image === 'string' ? body.chart_image : null,
      source_link: typeof body.source_link === 'string' ? body.source_link : null,
      video_url: typeof body.video_url === 'string' ? body.video_url : null,
      video_title: typeof body.video_title === 'string' ? body.video_title : null,
      audio_url: typeof body.audio_url === 'string' ? body.audio_url : null,
      audio_file: typeof body.audio_file === 'string' ? body.audio_file : null,
      transcript: typeof body.transcript === 'string' ? body.transcript : null,
      white_paper_pdf: typeof body.white_paper_pdf === 'string' ? body.white_paper_pdf : null,
      other: "",
      other_meta: "",
      toolset_associations_contributor_post: null,
      wpcf_publishdate: null,
      author_id: typeof body.author === 'string' && !isNaN(Number(body.author)) ? Number(body.author) : null,
    };

    try {
      const newArticleId = await ctx.runMutation(api.articles.createArticle, articleArgs);
      return new Response(JSON.stringify({ message: "Article created successfully", articleId: newArticleId }), {
        headers: { "Content-Type": "application/json" },
        status: 201, // Created
      });
    } catch (error: any) {
      console.error("Failed to create article:", error);
      // It's good practice to not expose raw error messages to the client.
      // You might have a more sophisticated error handling/logging mechanism.
      return new Response(JSON.stringify({ error: "Failed to create article on the server.", details: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }
  }),
});

// New endpoint to create an agent thread
http.route({
  path: "/createAgentThread",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // --- API Key Authentication --- 
    const expectedApiKey = process.env.CREATE_ARTICLE_API_KEY; // Using the same API key as createArticle

    if (!expectedApiKey) {
      console.error("CRITICAL: CREATE_ARTICLE_API_KEY environment variable is not set.");
      return new Response(JSON.stringify({ error: "API authentication is not configured on the server." }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }

    const providedApiKey = request.headers.get("X-API-Key");

    if (!providedApiKey) {
      return new Response(JSON.stringify({ error: "API key is missing in X-API-Key header." }), {
        headers: { "Content-Type": "application/json" },
        status: 401, // Unauthorized
      });
    }

    if (providedApiKey !== expectedApiKey) {
      return new Response(JSON.stringify({ error: "Invalid API key." }), {
        headers: { "Content-Type": "application/json" },
        status: 403, // Forbidden
      });
    }
    // --- End API Key Authentication ---

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Validate and prepare the args for createAgentThread
    const threadArgs = {
      userId: body.userId, // Optional user ID
      title: body.title, // Optional thread title
    };

    try {
      const threadId = await ctx.runMutation(api.threadMutations.createAgentThread, threadArgs);
      return new Response(JSON.stringify({ threadId }), {
        headers: { "Content-Type": "application/json" },
        status: 201, // Created
      });
    } catch (error: any) {
      console.error("Failed to create agent thread:", error);
      return new Response(JSON.stringify({ error: "Failed to create agent thread.", details: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }
  }),
});

// New endpoint to send a message to an agent thread
http.route({
  path: "/sendMessageToAgent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // --- API Key Authentication --- 
    const expectedApiKey = process.env.CREATE_ARTICLE_API_KEY; // Using the same API key as createArticle

    if (!expectedApiKey) {
      console.error("CRITICAL: CREATE_ARTICLE_API_KEY environment variable is not set.");
      return new Response(JSON.stringify({ error: "API authentication is not configured on the server." }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }

    const providedApiKey = request.headers.get("X-API-Key");

    if (!providedApiKey) {
      return new Response(JSON.stringify({ error: "API key is missing in X-API-Key header." }), {
        headers: { "Content-Type": "application/json" },
        status: 401, // Unauthorized
      });
    }

    if (providedApiKey !== expectedApiKey) {
      return new Response(JSON.stringify({ error: "Invalid API key." }), {
        headers: { "Content-Type": "application/json" },
        status: 403, // Forbidden
      });
    }
    // --- End API Key Authentication ---

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Basic validation for required fields
    if (body.threadId && typeof body.threadId !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid threadId. Expected string." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!body.prompt || typeof body.prompt !== 'string') {
      return new Response(JSON.stringify({ error: "Missing or invalid prompt. Expected string." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Prepare the arguments for sendMessageToAgent
    const messageArgs = {
      threadId: body.threadId,
      prompt: body.prompt,
      userId: body.userId, // Optional
      sponsoredContributorIds: body.sponsoredContributorIds, // New field
    };

    try {
      const response = await ctx.runAction(api.agent.sendMessageToAgent, messageArgs);
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error: any) {
      console.error("Failed to send message to agent:", error);
      return new Response(JSON.stringify({ error: "Failed to send message to agent.", details: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500, // Internal Server Error
      });
    }
  }),
});

// Endpoint to get articles by channel
http.route({
  path: "/getArticlesByChannel",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Handle CORS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Get parameters from URL query params
    const url = new URL(request.url);
    const channelParam = url.searchParams.get("channel");
    const numItemsParam = url.searchParams.get("numItems");
    const cursorParam = url.searchParams.get("cursor");

    // Validate required parameters
    if (!channelParam || isNaN(parseInt(channelParam, 10))) {
      return new Response(JSON.stringify({
        error: "Missing or invalid channel parameter. Must provide a valid channel ID number."
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
        },
        status: 400,
      });
    }

    // Convert and prepare parameters
    const channel = parseInt(channelParam, 10);
    const numItems = numItemsParam ? parseInt(numItemsParam, 10) : undefined;

    // Call the getByChannel query
    try {
      const articlesPage = await ctx.runQuery(api.articles.getByChannel, {
        channel,
        cursor: cursorParam || undefined,
        numItems,
      });

      return new Response(JSON.stringify(articlesPage), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
        },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching articles by channel:", error);
      return new Response(JSON.stringify({
        error: "Failed to fetch articles by channel",
        details: error instanceof Error ? error.message : String(error)
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
        },
        status: 500,
      });
    }
  }),
});

// Endpoint to get articles by their original_ids
http.route({
  path: "/getArticlesByOriginalIds",
  method: "POST", // Using POST to handle array of IDs in request body
  handler: httpAction(async (ctx, request) => {
    // Define CORS headers for consistent use
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // Handle CORS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({
        error: "Invalid JSON in request body"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
        status: 400,
      });
    }

    // Validate originalIds
    if (!body.originalIds || !Array.isArray(body.originalIds) || body.originalIds.length === 0) {
      return new Response(JSON.stringify({
        error: "Request must include a non-empty array of originalIds"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
        status: 400,
      });
    }

    // Convert and validate each original_id is a number
    const originalIds: number[] = [];
    try {
      for (const id of body.originalIds) {
        const numId = Number(id);
        if (isNaN(numId)) {
          throw new Error(`Invalid original_id: ${id} is not a number`);
        }
        originalIds.push(numId);
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: "Invalid original_id format. All IDs must be numbers",
        details: error instanceof Error ? error.message : String(error)
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
        status: 400,
      });
    }

    // Call the query
    try {
      const articles = await ctx.runQuery(api.articles.getArticlesByOriginalIds, {
        originalIds
      });

      return new Response(JSON.stringify(articles), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
        status: 200,
      });
    } catch (error) {
      console.error("Error fetching articles by original_ids:", error);
      return new Response(JSON.stringify({
        error: "Failed to fetch articles by original_ids",
        details: error instanceof Error ? error.message : String(error)
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
        status: 500,
      });
    }
  }),
});

// Helper function to map placefilter values
function mapPlacefilter(strapiValue: string | null): number | null {
  if (!strapiValue) return null;
  const mapping: Record<string, number> = {
    "Latest": 0,
    "Trending": 1,
    "Featured": 2
  };
  return mapping[strapiValue] ?? 0; // Default to Latest
}

// Helper function to transform Strapi entry data to Convex format
function mapStrapiToConvex(entry: any) {
  return {
    // IDs and relations
    original_id: entry.original_id,
    channel: entry.channel?.original_id || null,
    author_wpid: entry.contributor?.wp_user_id || null,
    author_id: entry.contributor?.original_id || null, // Contributor's original_id maps to author_id
    strapi_document_id: entry.documentId, // For tracking Strapi articles across publish/unpublish cycles

    // Required string fields - convert null to empty string
    title: entry.title || "",
    link: entry.link || "",
    content: entry.content || "",
    subtitle: entry.subtitle || "",
    seo_meta: entry.seo_meta || "",
    other: entry.other || "",
    other_meta: entry.other_meta || "",

    // Required dates - provide defaults
    publish_date: entry.publish_date ?
      new Date(entry.publish_date).toISOString().split('T')[0] :
      new Date().toISOString().split('T')[0],
    last_updated: new Date().toISOString(),

    // Numeric fields
    sponsored_position: entry.sponsored_position || null,
    rss_include: entry.rss_include ? 1 : 0,
    podcast_rss_include: entry.podcast_rss_include || 0,
    placefilter: mapPlacefilter(entry.placefilter),
    status: 1, // Default status for new articles

    // Optional fields that can be null
    source_link: entry.source_link,
    image_url: entry.image_url,
    video_url: entry.video_url,
    video_title: entry.video_title,
    audio_url: entry.audio_url,
    audio_file: entry.audio_file,
    transcript: entry.transcript,
    white_paper_pdf: entry.white_paper_pdf,
    chart_url: entry.chart_url,
    fresh_finance_category: entry.fresh_finance_category,

    // Legacy fields
    channel_url: entry.channel_url,
    secondary_channel: entry.secondary_channel,
    secondary_channel_url: entry.secondary_channel_url,
    toolset_associations_contributor_post: entry.toolset_associations_contributor_post,
    wpcf_publishdate: entry.wpcf_publishdate,
  };
}

// Add a new route for Strapi webhook processing
http.route({
  path: "/strapiWebhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Handle CORS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Parse the request body
    let body;
    try {
      body = await request.json();
      console.log("Strapi Webhook Event:", body.event, "for article:", body.entry?.title);
    } catch (e) {
      console.error("Error parsing Strapi webhook payload:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Only process publish events (ignore create/update drafts)
    if (body.event !== "entry.publish") {
      console.log(`Ignoring ${body.event} event - only processing entry.publish`);
      return new Response(JSON.stringify({
        success: true,
        message: `Event ${body.event} ignored - only processing entry.publish`
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Validate we have entry data
    if (!body.entry) {
      return new Response(JSON.stringify({ error: "Missing entry data in webhook payload" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    try {
      // Check if article already exists by Strapi document ID
      const existingArticle = await ctx.runQuery(api.articles.getByDocumentId, {
        documentId: body.entry.documentId
      });

      // Transform Strapi data to Convex format
      const transformedData = mapStrapiToConvex(body.entry);

      if (existingArticle) {
        // Update existing article
        await ctx.runMutation(api.articles.updateArticle, {
          articleId: existingArticle._id,
          ...transformedData
        });

        console.log(`Successfully updated article ${existingArticle._id} from Strapi entry ${body.entry.id} (${body.entry.title})`);

        return new Response(JSON.stringify({
          success: true,
          message: "Article updated successfully",
          action: "update",
          articleId: existingArticle._id,
          strapiId: body.entry.id,
          documentId: body.entry.documentId,
          title: body.entry.title
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        // Create new article
        const articleId = await ctx.runMutation(api.articles.createArticle, transformedData);

        console.log(`Successfully created article ${articleId} from Strapi entry ${body.entry.id} (${body.entry.title})`);

        return new Response(JSON.stringify({
          success: true,
          message: "Article created successfully",
          action: "create",
          articleId: articleId,
          strapiId: body.entry.id,
          documentId: body.entry.documentId,
          title: body.entry.title
        }), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        });
      }

    } catch (error: any) {
      console.error("Failed to process article from Strapi webhook:", error);
      return new Response(JSON.stringify({
        error: "Failed to process article",
        details: error.message,
        strapiId: body.entry?.id,
        documentId: body.entry?.documentId,
        title: body.entry?.title
      }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }
  }),
});

// You must export the http router as the default export
export default http;