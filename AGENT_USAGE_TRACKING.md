# Agent Usage & Pricing Tracking

## Overview

The `sendMessageToAgent` action and HTTP endpoint now return detailed usage and pricing information for OpenAI API calls, enabling cost tracking and monitoring.

## Response Format

The response now includes an optional `usage` field with token consumption details:

```typescript
{
  threadId: string,
  responseText: string,
  sources?: Array<{
    title: string,
    link: string,
    truncatedContent: string
  }>,
  usage?: {
    // Standard token usage
    promptTokens?: number,
    completionTokens?: number,
    totalTokens?: number,
    
    // OpenAI-specific metadata
    cachedPromptTokens?: number,
    reasoningTokens?: number,
    acceptedPredictionTokens?: number,
    rejectedPredictionTokens?: number,
  }
}
```

## Usage Fields Explained

### Standard Usage
- **`promptTokens`**: Number of tokens in the input prompt
- **`completionTokens`**: Number of tokens in the generated response
- **`totalTokens`**: Total tokens used (prompt + completion)

### OpenAI-Specific Metadata
- **`cachedPromptTokens`**: Number of prompt tokens that were cache hits (cost savings)
- **`reasoningTokens`**: Additional tokens used by reasoning models (o1, o3, o4 series)
- **`acceptedPredictionTokens`**: Tokens from predicted outputs that were accepted
- **`rejectedPredictionTokens`**: Tokens from predicted outputs that were rejected

## Cost Calculation

### Standard Pricing
Most OpenAI models charge separately for input and output tokens:
- **Input cost** = `promptTokens × input_price_per_token`
- **Output cost** = `completionTokens × output_price_per_token`
- **Total cost** = `input_cost + output_cost`

### Cache Savings
Cached tokens are typically free or heavily discounted:
- **Cache savings** = `cachedPromptTokens × input_price_per_token`

### Reasoning Models
Reasoning models have additional costs:
- **Reasoning cost** = `reasoningTokens × reasoning_price_per_token`

## Example Response

```json
{
  "threadId": "k123abc...",
  "responseText": "Based on the article \"Market Analysis Q4\" (Source: example.com/market-q4), the market shows...",
  "sources": [
    {
      "title": "Market Analysis Q4",
      "link": "https://example.com/market-q4",
      "truncatedContent": "The quarterly market analysis reveals..."
    }
  ],
  "usage": {
    "promptTokens": 1250,
    "completionTokens": 380,
    "totalTokens": 1630,
    "cachedPromptTokens": 200
  }
}
```

## HTTP Endpoint Usage

### Request
```bash
curl -X POST https://your-convex-url/sendMessageToAgent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "threadId": "optional-existing-thread-id",
    "prompt": "What are the latest trends in AI?",
    "userId": "optional-user-id"
  }'
```

### Response
The HTTP endpoint returns the same format as the Convex action, including the usage information.

## Implementation Notes

- Usage information is extracted from the AI SDK's `generateText` response
- The feature gracefully handles cases where usage data is unavailable
- All usage fields are optional to maintain backward compatibility
- Provider-specific metadata is only included when available

## Cost Monitoring

You can use this data to:
1. **Track API costs** per conversation or user
2. **Monitor token efficiency** of your prompts
3. **Identify cache hit rates** for optimization
4. **Budget and alert** on usage thresholds
5. **Analyze reasoning model costs** separately

## Model Compatibility

This feature works with:
- ✅ **OpenAI models** (GPT-4, GPT-3.5, o1, o3, o4 series)
- ✅ **OpenAI-compatible providers** using the AI SDK
- ⚠️ **Other providers** may have different metadata structures

The usage extraction is designed to be robust and will not break if usage data is unavailable from any provider. 