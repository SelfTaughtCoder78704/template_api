// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api"; // To call your queries/mutations

const http = httpRouter();

// Example: An endpoint to get all articles
http.route({
  path: "/getArticles", // This will be accessible at https://<your-convex-url>/getArticles
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // You can call your existing query here
    const articles = await ctx.runQuery(api.articles.get); // Assuming 'articles.get' is your query

    return new Response(JSON.stringify(articles), {
      headers: { "Content-Type": "application/json" },
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
    if (!body.threadId || typeof body.threadId !== 'string') {
      return new Response(JSON.stringify({ error: "Missing or invalid threadId. Expected string." }), {
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

// You must export the http router as the default export
export default http;