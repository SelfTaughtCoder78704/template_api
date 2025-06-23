import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "./rateLimiter";

// Test function to check if a rate limit would pass without consuming it
export const checkRateLimit = action({
  args: {
    limitName: v.string(),
    key: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    retryAfter: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    try {
      if (args.key) {
        return await rateLimiter.check(ctx, args.limitName as any, { key: args.key });
      } else {
        return await rateLimiter.check(ctx, args.limitName as any);
      }
    } catch (error: any) {
      return { ok: false, retryAfter: error.data?.retryAfter };
    }
  },
});

// Test function to consume a rate limit
export const testRateLimit = action({
  args: {
    limitName: v.string(),
    key: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  returns: v.object({
    ok: v.boolean(),
    retryAfter: v.optional(v.number()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const options: any = {};
      if (args.key) options.key = args.key;
      if (args.count) options.count = args.count;

      const result = await rateLimiter.limit(ctx, args.limitName as any, options);

      return {
        ok: result.ok,
        retryAfter: result.retryAfter,
        message: result.ok ? "Rate limit passed" : `Rate limit exceeded, retry after ${result.retryAfter}ms`
      };
    } catch (error: any) {
      return {
        ok: false,
        retryAfter: error.data?.retryAfter,
        message: `Rate limit exceeded: ${error.message}`
      };
    }
  },
});

// Test function to reset a rate limit
export const resetRateLimit = action({
  args: {
    limitName: v.string(),
    key: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      if (args.key) {
        await rateLimiter.reset(ctx, args.limitName as any, { key: args.key });
      } else {
        await rateLimiter.reset(ctx, args.limitName as any);
      }
      return {
        success: true,
        message: `Rate limit ${args.limitName} reset successfully`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to reset rate limit: ${error.message}`
      };
    }
  },
});

// Test function to get current rate limit value
export const getRateLimitValue = action({
  args: {
    limitName: v.string(),
    key: v.optional(v.string()),
  },
  returns: v.object({
    config: v.any(),
    value: v.number(),
    timestamp: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.key) {
      return await rateLimiter.getValue(ctx, args.limitName as any, { key: args.key });
    } else {
      return await rateLimiter.getValue(ctx, args.limitName as any);
    }
  },
});

// Helper function to run multiple rate limit tests
export const runRateLimitTests = action({
  args: {
    threadId: v.string(),
    numRequests: v.optional(v.number()),
  },
  returns: v.array(v.object({
    requestNumber: v.number(),
    globalResult: v.object({
      ok: v.boolean(),
      retryAfter: v.optional(v.number()),
    }),
    threadResult: v.object({
      ok: v.boolean(),
      retryAfter: v.optional(v.number()),
    }),
    testResult: v.object({
      ok: v.boolean(),
      retryAfter: v.optional(v.number()),
    }),
  })),
  handler: async (ctx, args) => {
    const numRequests = args.numRequests || 5;
    const results = [];

    for (let i = 1; i <= numRequests; i++) {
      const globalResult = await rateLimiter.limit(ctx, "globalSearch");
      const threadResult = await rateLimiter.limit(ctx, "threadSearch", { key: args.threadId });
      const testResult = await rateLimiter.limit(ctx, "testLimit");

      results.push({
        requestNumber: i,
        globalResult,
        threadResult,
        testResult,
      });

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  },
});

export { rateLimiter }; 