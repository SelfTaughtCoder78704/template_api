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
