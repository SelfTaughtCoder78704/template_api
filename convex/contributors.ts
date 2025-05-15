import { v } from "convex/values";
import { query } from "./_generated/server";


export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("contributors").collect();
  },
});


// should be able to get by original_id
export const getById = query({
  args: { original_id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("contributors").filter((q) => q.eq(q.field("original_id"), args.original_id)).first();
  },
});


// get by wpid
export const getByWpid = query({
  args: { wpid: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("contributors").filter((q) => q.eq(q.field("wp_user_id"), args.wpid)).first();
  },
});