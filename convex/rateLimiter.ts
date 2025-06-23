import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// Shared rate limiter instance with all our configurations
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Global rate limit to prevent system-wide abuse
  globalSearch: {
    kind: "token bucket",
    rate: 1000, // 1000 searches per hour globally
    period: HOUR,
    capacity: 100, // Allow bursts up to 100
    shards: 10 // Scale for high throughput
  },

  // Per-thread rate limit to prevent single thread spam
  threadSearch: {
    kind: "token bucket",
    rate: 60, // 60 searches per hour per thread
    period: HOUR,
    capacity: 10 // Allow bursts up to 10
  },

  // Test rate limit for quick testing (very restrictive)
  testLimit: {
    kind: "token bucket",
    rate: 3, // Only 3 requests per minute for testing
    period: MINUTE,
    capacity: 2 // Only allow 2 burst requests
  }
}); 