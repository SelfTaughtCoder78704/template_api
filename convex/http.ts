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
      author: body.author,
      channel: body.channel,
      status: body.status,
      // Optional fields: provide them if they exist in the body, otherwise they'll be undefined
      // and the mutation should handle them as per its v.optional() schema.
      subtitle: typeof body.subtitle === 'string' ? body.subtitle : "",
      link_slug: typeof body.link_slug === 'string' ? body.link_slug : "",
      link_preview: typeof body.link_preview === 'string' ? body.link_preview : "",
      publish_date: typeof body.publish_date === 'string' ? body.publish_date : "", // Consider date validation
      publish_time: typeof body.publish_time === 'string' ? body.publish_time : "", // Consider time validation
      image: typeof body.image === 'string' ? body.image : "",
      audio_file: typeof body.audio_file === 'string' ? body.audio_file : "",
      audio_url: typeof body.audio_url === 'string' ? body.audio_url : "",
      video_title: typeof body.video_title === 'string' ? body.video_title : "",
      video_url: typeof body.video_url === 'string' ? body.video_url : "",
      chart_image: typeof body.chart_image === 'string' ? body.chart_image : "",
      transcript: typeof body.transcript === 'string' ? body.transcript : "",
      include_in_article_rss: typeof body.include_in_article_rss === 'boolean' ? body.include_in_article_rss : false,
      include_in_podcast_rss: includeInPodcastRss, // Already handled above
      secondary_channel: typeof body.secondary_channel === 'string' ? body.secondary_channel : "",
      placefilter: typeof body.placefilter === 'string' ? body.placefilter : "",
      fresh_finance_category: typeof body.fresh_finance_category === 'string' ? body.fresh_finance_category : "",
      source_link: typeof body.source_link === 'string' ? body.source_link : "",
      white_paper_pdf: typeof body.white_paper_pdf === 'string' ? body.white_paper_pdf : "",
      sponsored_position: typeof body.sponsored_position === 'string' ? body.sponsored_position : "None", // Default if not string
      last_updated: typeof body.last_updated === 'string' ? body.last_updated : new Date().toISOString(), // Default to now
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

// You must export the http router as the default export
export default http;