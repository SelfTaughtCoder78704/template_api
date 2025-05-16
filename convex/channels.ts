import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

export const getChannelByOriginalId = query({
  args: {
    original_id: v.number(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.query("channels").filter((q) => q.eq(q.field("original_id"), args.original_id)).first();
    return channel;
  },
});


export const channelSlug = query({
  args: {
    original_id: v.number(),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.query("channels").filter((q) => q.eq(q.field("original_id"), args.original_id)).first();
    return channel?.slug;
  },
});

export const getChannelSlugByChannelOriginalId = query({
  args: { channelOriginalId: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    if (args.channelOriginalId === null || args.channelOriginalId === undefined) {
      return null;
    }
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_original_id", (q) => q.eq("original_id", args.channelOriginalId))
      .first();
    return channel?.slug ?? null;
  },
});

export const getChannelOriginalIdBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args): Promise<number | null> => {
    if (!args.slug) {
      return null;
    }
    // schema.ts defines channels.slug as v.union(v.string(), v.null())
    // We need to find a channel where its slug field equals args.slug
    // The 'channels' table has an index 'by_original_id', but not directly on 'slug'.
    // A full table scan might be inefficient for large channel lists.
    // For now, we will filter. If performance becomes an issue, an index on 'slug' should be added to schema.ts.
    const channel = await ctx.db
      .query("channels")
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .first();
    return channel?.original_id ?? null;
  },
});
