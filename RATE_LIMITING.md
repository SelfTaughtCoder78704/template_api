# Rate Limiting Documentation

This document explains the rate limiting system implemented for the article agent API.

## Overview

The system uses token bucket rate limiting to prevent abuse while allowing reasonable burst usage. Rate limits are applied at two levels: global (system-wide) and per-thread (per conversation).

## Rate Limit Configuration

### Global Rate Limit
- **Purpose**: Protects the entire system from being overwhelmed
- **Limit**: 1,000 requests per hour
- **Burst Capacity**: 100 requests
- **Shards**: 10 (for high performance)
- **Applies to**: All requests regardless of user or thread

### Per-Thread Rate Limit  
- **Purpose**: Prevents individual conversations from spamming
- **Limit**: 60 requests per hour per thread
- **Burst Capacity**: 10 requests
- **Applies to**: Each unique threadId gets its own bucket

### Test Rate Limit
- **Purpose**: For testing rate limiting functionality
- **Limit**: 3 requests per minute
- **Burst Capacity**: 2 requests
- **Use**: Development and debugging only

## How It Works

### Token Bucket Algorithm
Each rate limit uses a token bucket:
1. **Bucket starts full** with tokens equal to burst capacity
2. **Each request costs 1 token**
3. **Tokens refill** at the configured rate
4. **Requests blocked** when bucket is empty

### Request Flow
```
1. Request arrives with threadId
2. Check global rate limit first
   ├─ If global limit exceeded → Block with global error
   └─ If global limit OK → Continue to step 3
3. Check thread-specific rate limit  
   ├─ If thread limit exceeded → Block with thread error
   └─ If thread limit OK → Allow request
```

## Rate Limit Details

### Global Rate Limiting
- **Rate**: 1000 requests/hour = ~17 requests/minute
- **Burst**: 100 requests can be made immediately
- **Recovery**: Tokens refill at ~17 per minute
- **Sharding**: Uses 10 parallel buckets for performance
- **Error**: `"Global rate limit exceeded"`

### Per-Thread Rate Limiting  
- **Rate**: 60 requests/hour = 1 request/minute
- **Burst**: 10 requests can be made immediately
- **Recovery**: Tokens refill at 1 per minute
- **Isolation**: Each threadId has independent bucket
- **Error**: `"Thread rate limit exceeded"`

## Error Responses

When rate limits are exceeded, the API returns a ConvexError:

```json
{
  "kind": "RateLimited",
  "limitType": "global|thread",
  "threadId": "thread_id_here", 
  "retryAfter": 19513,
  "message": "Rate limit exceeded. Retry after 20 seconds."
}
```

### Error Fields
- **`kind`**: Always "RateLimited"
- **`limitType`**: "global" or "thread" 
- **`threadId`**: Only present for thread limits
- **`retryAfter`**: Milliseconds until next request allowed
- **`message`**: Human-readable error message

## Usage Examples

### Normal Usage
```
User makes 5 quick questions in a thread:
- All 5 requests pass (burst capacity)
- Thread bucket: 10 → 5 tokens remaining
- User can make 5 more before hitting limit
```

### Rate Limit Hit
```
User makes 11 requests rapidly:
- First 10 requests pass (burst capacity used)
- 11th request blocked: "Thread rate limit exceeded"
- Must wait ~1 minute for next request
```

### System Overload
```
Many users make requests simultaneously:
- If total exceeds 100 burst + 1000/hour rate
- Global limit kicks in: "Global rate limit exceeded"  
- Affects all users until system recovers
```

## Database Storage

Rate limit data is stored in the `rateLimits` table:

### Fields
- **`_id`**: Unique identifier
- **`key`**: Rate limit key (threadId or "unset" for global)
- **`name`**: Rate limit name ("globalSearch", "threadSearch", "testLimit")
- **`shard`**: Shard number (0-9 for global, 0 for others)
- **`ts`**: Timestamp of last update
- **`value`**: Current token count in bucket
- **`_creationTime`**: When the entry was first created

### Sharding
Global rate limits use 10 shards for performance:
- Each shard handles 1/10th of the load
- Requests distributed automatically across shards
- Reduces contention under high load

## Implementation Files

### Core Files
- **`convex/rateLimiter.ts`**: Shared rate limiter configuration
- **`convex/agent.ts`**: Rate limiting integration in main agent
- **`convex/convex.config.ts`**: Rate limiter component registration

### Test Files  
- **`convex/rateLimitTest.ts`**: Rate limiting test functions
- **`test-rate-limit.js`**: Node.js test script

## Testing Rate Limits

### Using Test Functions
```javascript
// Check current bucket value
await client.action("rateLimitTest:getRateLimitValue", {
  limitName: "threadSearch",
  key: "your-thread-id"
});

// Test rate limit consumption
await client.action("rateLimitTest:testRateLimit", {
  limitName: "threadSearch", 
  key: "your-thread-id"
});

// Reset rate limit (for testing)
await client.action("rateLimitTest:resetRateLimit", {
  limitName: "threadSearch",
  key: "your-thread-id"  
});
```

### Manual Testing
1. Make requests to the agent endpoint
2. Monitor Convex logs for rate limit debug messages
3. Check the `rateLimits` table in Convex dashboard
4. Verify error responses when limits exceeded

## Monitoring

### Log Messages
Rate limiting produces debug logs:
```
[RATE LIMIT DEBUG] Starting rate limit checks for threadId: abc123
[RATE LIMIT DEBUG] Global limit result: { ok: true }
[RATE LIMIT DEBUG] Current thread bucket value: { value: 5.2, ... }
[RATE LIMIT DEBUG] Thread limit result: { ok: false, retryAfter: 19513 }
[RATE LIMIT DEBUG] Thread rate limit EXCEEDED for abc123
```

### Dashboard Monitoring
- View `rateLimits` table in Convex dashboard
- Monitor bucket values and timestamps
- Track which threads/shards are most active
- Identify patterns in rate limit usage

## Configuration Tuning

### Adjusting Limits
Edit `convex/rateLimiter.ts` to modify:
- **Rate**: Requests per time period
- **Period**: Time window (HOUR, MINUTE, etc.)
- **Capacity**: Burst capacity
- **Shards**: Number of parallel buckets (global only)

### Recommended Settings
- **Global**: High limits (1000/hour) for system protection
- **Thread**: Moderate limits (60/hour) for spam prevention  
- **Burst**: Allow reasonable quick usage (10 requests)

## Legal Considerations

This system was designed without IP-based tracking due to legal requirements around IP address storage and privacy regulations. Thread-based rate limiting provides effective abuse prevention while maintaining user privacy.

## Troubleshooting

### Rate Limits Not Working
1. Check if multiple RateLimiter instances exist
2. Ensure all files import from shared `rateLimiter.ts`
3. Verify rate limiter component is registered in `convex.config.ts`

### Unexpected Rate Limit Errors
1. Check current bucket values in dashboard
2. Review recent request patterns in logs
3. Verify rate limit configuration matches expectations

### Performance Issues
1. Consider increasing global shard count
2. Monitor bucket contention in logs
3. Adjust burst capacity if needed

## Future Enhancements

Potential improvements to consider:
- User-based rate limiting (with authentication)
- Different limits for different API endpoints
- Dynamic rate limit adjustment based on system load
- Rate limit metrics and alerting
- Whitelist/blacklist functionality 