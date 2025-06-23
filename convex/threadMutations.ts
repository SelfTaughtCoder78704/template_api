import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { articleAgent } from "./openAiAgent"; // Import the agent instance

// Public mutation to create a new agent thread
export const createAgentThread = mutation({
  args: {
    // Assuming you have a 'users' table and Id<'users'> type
    // If not, you can remove userId or change its type
    userId: v.optional(v.id("users")),
    title: v.optional(v.string()), // Optional title for the thread
  },
  returns: v.string(), // articleAgent.createThread returns a string threadId
  handler: async (ctx, args) => {
    const { threadId } = await articleAgent.createThread(ctx, {
      userId: args.userId,
      title: args.title ?? "New Article Agent Thread",
    });
    return threadId;
  },
}); 