// Simple test script to test rate limiting
// Run with: node test-rate-limit.js

const { ConvexHttpClient } = require("convex/browser");

// Replace with your actual deployment URL
const client = new ConvexHttpClient(process.env.CONVEX_URL || "your-deployment-url");

async function testRateLimiting() {
  console.log("🧪 Testing Rate Limiting...\n");

  // Test 1: Test the restrictive testLimit (3 per minute)
  console.log("Test 1: Testing restrictive limit (3 per minute)");
  for (let i = 1; i <= 5; i++) {
    try {
      const result = await client.action("rateLimitTest:testRateLimit", {
        limitName: "testLimit",
        count: 1
      });
      console.log(`Request ${i}: ${result.message}`);
    } catch (error) {
      console.log(`Request ${i}: Rate limit error - ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 2: Test thread-specific limits
  console.log("Test 2: Testing thread-specific limits");
  const threadId = "test-thread-123";

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await client.action("rateLimitTest:testRateLimit", {
        limitName: "threadSearch",
        key: threadId,
        count: 1
      });
      console.log(`Thread request ${i}: ${result.message}`);
    } catch (error) {
      console.log(`Thread request ${i}: Rate limit error - ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 3: Test the actual agent with rate limiting
  console.log("Test 3: Testing actual agent with rate limiting");

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await client.action("agent:sendMessageToAgent", {
        prompt: `Test message ${i} - tell me about financial planning`,
        threadId: "rate-limit-test-thread"
      });
      console.log(`Agent request ${i}: Success - ${result.responseText.substring(0, 100)}...`);
    } catch (error) {
      console.log(`Agent request ${i}: Error - ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 4: Check current rate limit values
  console.log("Test 4: Checking current rate limit values");
  try {
    const globalValue = await client.action("rateLimitTest:getRateLimitValue", {
      limitName: "globalSearch"
    });
    console.log(`Global search limit: ${globalValue.value} remaining`);

    const threadValue = await client.action("rateLimitTest:getRateLimitValue", {
      limitName: "threadSearch",
      key: threadId
    });
    console.log(`Thread search limit: ${threadValue.value} remaining`);

    const testValue = await client.action("rateLimitTest:getRateLimitValue", {
      limitName: "testLimit"
    });
    console.log(`Test limit: ${testValue.value} remaining`);
  } catch (error) {
    console.log(`Error checking values: ${error.message}`);
  }

  console.log("\n🎉 Rate limiting test completed!");
}

// Run the test
testRateLimiting().catch(console.error); 