import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  articles: defineTable({
    author: v.string(),
    sponsored_position: v.string(), // Assuming "None" is a valid string value, otherwise consider v.optional() or union
    title: v.string(),
    link_slug: v.string(),
    link_preview: v.string(),
    source_link: v.optional(v.string()),
    content: v.string(), // Consider v.optional if content can be empty/missing
    channel: v.string(),
    secondary_channel: v.optional(v.string()),
    publish_date: v.string(), // Consider v.number() for timestamp if easier for querying/sorting
    publish_time: v.string(), // Consider storing combined datetime as v.number() (timestamp)
    image: v.optional(v.string()), // Or v.optional(v.id("_storage")) if using Convex file storage
    chart_image: v.optional(v.string()), // Or v.optional(v.id("_storage"))
    video_url: v.optional(v.string()),
    video_title: v.optional(v.string()),
    audio_url: v.optional(v.string()),
    audio_file: v.optional(v.string()), // Or v.optional(v.id("_storage"))
    transcript: v.optional(v.string()),
    white_paper_pdf: v.optional(v.string()), // Or v.optional(v.id("_storage"))
    subtitle: v.optional(v.string()),
    placefilter: v.string(),
    include_in_article_rss: v.boolean(),
    include_in_podcast_rss: v.string(), // Consider v.union(v.literal("None"), ...) if values are fixed
    fresh_finance_category: v.optional(v.string()),
    status: v.string(), // Consider v.union(v.literal("Published"), v.literal("Unpublished"), ...)
    last_updated: v.string(), // Consider v.number() for timestamp
    embedding: v.optional(v.array(v.float64())), // Vector embedding field
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["channel", "status"]
  }),
  // Add other tables here if needed
}); 