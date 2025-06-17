# Agent Usage Tracking

## Overview
Token usage tracking has been implemented for the `articleAgent` using Convex's built-in `usageHandler`. This provides comprehensive tracking of LLM token consumption with detailed metadata.

## Implementation

### Usage Handler
The agent is configured with a `usageHandler` that automatically captures:
- **Who**: `userId`, `threadId`, `agentName`
- **What**: `model`, `provider` (e.g., "openai", "gpt-4.1-2025-04-14")
- **Usage**: `promptTokens`, `completionTokens`, `totalTokens`
- **Metadata**: Provider-specific data like cached tokens, reasoning tokens, etc.

```typescript
usageHandler: async (ctx, args) => {
  const {
    userId, threadId, agentName,
    model, provider,
    usage, providerMetadata
  } = args;
  
  // Automatic logging
  console.log(`[Agent Usage] User: ${userId}, Thread: ${threadId}`);
  console.log(`[Agent Usage] Tokens - Prompt: ${usage.promptTokens}, Completion: ${usage.completionTokens}, Total: ${usage.totalTokens}`);
  
  // Optional: Save to database for billing/analytics
  // await ctx.runMutation(api.usage.logUsage, { ... });
}
```

## Benefits
- **Automatic**: No manual parsing required
- **Comprehensive**: Captures all usage metadata
- **Reliable**: Built into Convex's agent framework
- **Extensible**: Can easily save to database for billing

## Future Enhancements
- Create a `usage` table to store historical data
- Implement per-user billing calculations  
- Add usage analytics and reporting
- Set up usage alerts and rate limiting

## API Response
The `sendMessageToAgent` action returns:
```typescript
{
  threadId: string,
  responseText: string,
  sources?: Array<{
    title: string,
    link: string, 
    truncatedContent: string
  }>
}
```

Usage data is handled separately by the `usageHandler` and can be persisted to a database if needed for billing or analytics purposes. 