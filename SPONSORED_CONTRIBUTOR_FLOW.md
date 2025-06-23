# Sponsored Contributor Search Flow Documentation

## Overview

The sponsored contributor search feature enhances the existing AI agent by adding a parallel search that finds the most relevant articles from specific contributors. This provides a way to surface sponsored content that is contextually relevant to the user's query.

## Architecture

### High-Level Flow
```
NextJS App → HTTP Endpoint → Agent Action → Parallel Execution:
                                         ├── Normal AI Agent Search
                                         └── Sponsored Contributor Search
                                         ↓
                                    Combined Results
```

### Key Components

1. **HTTP Endpoint**: `/sendMessageToAgent` - Accepts sponsored contributor IDs
2. **Agent Action**: `sendMessageToAgent` - Orchestrates parallel searches
3. **Embedding Action**: `searchSponsoredContributorArticles` - Handles contributor-specific search
4. **Database Query**: `getByMultipleAuthorIds` - Fetches articles by contributor IDs

## API Usage

### Request Format
```json
POST /sendMessageToAgent
{
  "threadId": "optional-thread-id",
  "prompt": "Tell me about retirement planning",
  "userId": "optional-user-id",
  "sponsoredContributorIds": [123, 456, 789]  // NEW FIELD
}
```

### Response Format
```json
{
  "threadId": "thread-12345",
  "responseText": "Based on my research, retirement planning involves...",
  "sources": [
    // Normal AI search results
    {
      "title": "401k Basics",
      "link": "advisorpedia.com/finance/401k-basics",
      "truncatedContent": "A 401k is a retirement savings plan..."
    }
  ],
  "sponsoredSources": [
    // NEW - Sponsored contributor articles
    {
      "title": "Retirement Planning for Millennials",
      "link": "advisorpedia.com/planning/retirement-millennials",
      "truncatedContent": "Young professionals should start..."
    }
  ]
}
```

## Technical Implementation

### 1. Database Schema
```sql
-- Contributors table
contributors {
  original_id: number,  // Primary identifier
  name: string,
  // ... other fields
}

-- Articles table  
articles {
  author_id: number,    // Maps to contributors.original_id
  title: string,
  content: string,
  embedding: float64[], // 1536-dimensional vector
  // ... other fields
}
```

### 2. Parallel Execution Pattern
```typescript
const [agentResult, sponsoredSources] = await Promise.all([
  // Path A: Normal AI agent search
  (async () => {
    // Agent uses searchArticlesTool for semantic search
    // Returns AI response + sources
  })(),
  
  // Path B: Sponsored contributor search  
  args.sponsoredContributorIds?.length 
    ? ctx.runAction(internal.embeddingActions.searchSponsoredContributorArticles, {
        searchQuery: args.prompt,
        contributorIds: args.sponsoredContributorIds,
        limit: 3
      })
    : Promise.resolve(undefined)
]);
```

### 3. Sponsored Contributor Search Algorithm

#### Step 1: Fetch Contributor Articles
```typescript
// Get all articles by specified contributors
const contributorArticles = await ctx.runQuery(api.articles.getByMultipleAuthorIds, {
  author_ids: [123, 456, 789]
});
// Result: Array of all articles by these contributors
```

#### Step 2: Generate Query Embedding
```typescript
// Convert user query to vector representation
const embeddingResponse = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: "Tell me about retirement planning"
});
const queryEmbedding = embeddingResponse.data[0].embedding; // [0.1, 0.3, -0.2, ...]
```

#### Step 3: Calculate Similarity Scores
```typescript
const articlesWithScores = contributorArticles
  .filter(article => article.embedding && article.embedding.length > 0)
  .map(article => {
    // Calculate cosine similarity between query and article
    const dotProduct = queryEmbedding.reduce((sum, val, i) => 
      sum + val * article.embedding[i], 0);
    
    const queryMagnitude = Math.sqrt(queryEmbedding.reduce((sum, val) => 
      sum + val * val, 0));
    
    const articleMagnitude = Math.sqrt(article.embedding.reduce((sum, val) => 
      sum + val * val, 0));
    
    const similarity = dotProduct / (queryMagnitude * articleMagnitude);
    
    return { article, similarity };
  })
  .sort((a, b) => b.similarity - a.similarity) // Highest similarity first
  .slice(0, 3); // Take top 3
```

#### Step 4: Format Results
```typescript
// Convert to standardized format with reconstructed links
const slimDocuments = articlesWithScores.map(({ article }) => ({
  _id: article._id,
  title: article.title,
  content: article.content + `\n\n(Source: ${reconstructedLink})`,
  link: article.link,
  reconstructedLink: articleLink
}));
```

## Similarity Algorithm Deep Dive

### Cosine Similarity Explained

Cosine similarity measures the cosine of the angle between two vectors in high-dimensional space:

```
similarity = (A · B) / (||A|| × ||B||)

Where:
- A · B = dot product of vectors A and B
- ||A|| = magnitude (length) of vector A  
- ||B|| = magnitude (length) of vector B
```

### Similarity Score Interpretation
- **1.0**: Identical semantic meaning
- **0.8-0.9**: Very similar content
- **0.6-0.7**: Moderately related
- **0.3-0.5**: Somewhat related
- **0.0-0.2**: Unrelated content
- **Negative**: Contradictory content

### Example Calculation
```
Query: "retirement planning" → [0.1, 0.3, -0.2, 0.5, ...]
Article: "401k Planning Tips" → [0.2, 0.1, -0.1, 0.4, ...]

Dot Product: (0.1×0.2) + (0.3×0.1) + (-0.2×-0.1) + (0.5×0.4) + ...
           = 0.02 + 0.03 + 0.02 + 0.20 + ... = 0.85

Query Magnitude: √(0.1² + 0.3² + (-0.2)² + 0.5² + ...) = 1.2
Article Magnitude: √(0.2² + 0.1² + (-0.1)² + 0.4² + ...) = 1.1

Similarity: 0.85 / (1.2 × 1.1) = 0.64
```

## Rate Limiting

The feature respects existing rate limiting:
- **Global**: 1000 requests/hour across all users
- **Thread**: 10 requests per conversation thread
- Rate limits apply to the entire request, not individual searches

## Performance Considerations

### Parallel Execution Benefits
- **Without Parallel**: Agent search (2s) + Contributor search (1s) = 3s total
- **With Parallel**: max(Agent search (2s), Contributor search (1s)) = 2s total

### Database Optimization
- Uses existing `by_author_id` index for fast contributor article lookup
- Embedding calculations happen in memory after database fetch
- Vector similarity uses optimized mathematical operations

### Caching Opportunities
- Query embeddings could be cached for repeated queries
- Contributor article sets could be cached if contributor lists are stable

## Error Handling

### Graceful Degradation
```typescript
// If sponsored search fails, normal search still works
const sponsoredSources = args.sponsoredContributorIds?.length 
  ? await contributorSearch().catch(err => {
      console.error("Sponsored search failed:", err);
      return undefined; // Fail gracefully
    })
  : undefined;
```

### Common Error Scenarios
1. **No articles found for contributors**: Returns empty array
2. **Embedding generation fails**: Logs error, returns empty results
3. **Database query fails**: Logs error, continues with normal search
4. **Invalid contributor IDs**: Silently filters out, processes valid ones

## Monitoring and Logging

### Key Metrics to Track
- Sponsored search execution time
- Number of contributor articles processed
- Similarity score distributions
- Cache hit rates (if implemented)

### Debug Logging
```typescript
console.log(`[searchSponsoredContributorArticles] Found ${contributorArticles.length} articles from ${args.contributorIds.length} contributors.`);
console.log(`[searchSponsoredContributorArticles] Ranked ${articlesWithScores.length} articles by similarity.`);
```

## Future Enhancements

### Potential Optimizations
1. **Similarity Threshold**: Only return articles above certain similarity score
2. **Contributor Weighting**: Give higher priority to certain contributors
3. **Diversity Scoring**: Ensure variety in returned articles
4. **Caching Layer**: Cache embeddings and contributor article sets
5. **A/B Testing**: Compare different similarity algorithms

### Advanced Features
1. **Hybrid Ranking**: Combine similarity with article popularity/recency
2. **Category Filtering**: Respect article categories in similarity calculation
3. **Personalization**: Factor in user preferences or history
4. **Real-time Updates**: Handle new articles from contributors dynamically

## Testing Strategy

### Unit Tests
- Test similarity calculation accuracy
- Verify contributor article fetching
- Validate error handling scenarios

### Integration Tests  
- End-to-end API testing with various contributor combinations
- Performance testing under load
- Rate limiting behavior verification

### Manual Testing Scenarios
```bash
# Test with valid contributors
curl -X POST /sendMessageToAgent \
  -d '{"prompt": "retirement planning", "sponsoredContributorIds": [123, 456]}'

# Test without contributors (backward compatibility)
curl -X POST /sendMessageToAgent \
  -d '{"prompt": "retirement planning"}'

# Test with non-existent contributors
curl -X POST /sendMessageToAgent \
  -d '{"prompt": "retirement planning", "sponsoredContributorIds": [999, 888]}'
```

## Deployment Checklist

- [ ] Database indexes are in place (`by_author_id`)
- [ ] Rate limiting is configured and tested
- [ ] Error handling covers all failure modes
- [ ] Logging is configured for monitoring
- [ ] API documentation is updated
- [ ] Frontend integration is tested
- [ ] Performance benchmarks are established
- [ ] Rollback plan is prepared

## Conclusion

The sponsored contributor search feature provides a sophisticated way to surface relevant sponsored content without compromising the user experience. By using semantic similarity rather than simple keyword matching, it ensures that sponsored articles are genuinely relevant to the user's query while maintaining the quality and usefulness of the AI agent's responses. 