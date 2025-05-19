// batchImportArticles.mjs
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js"; // Adjust path if needed
import fs from "fs/promises";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

// --- Configuration ---
const CONVEX_URL = 'https://shocking-albatross-305.convex.cloud'; // !! REPLACE THIS !!
const INPUT_JSONL_FILE = "./advisorpedia_articles-3019-3521.jsonl"; // Or your actual file path
const MUTATIONS_PER_BATCH = 10;
const DELAY_BETWEEN_MUTATIONS_MS = 500; // 0.5 seconds
const DELAY_AFTER_BATCH_MS = 10000;   // 10 seconds
const START_FROM_LINE = 1; // New configuration: Line number to start processing from (1-indexed)
// --- End Configuration ---

if (CONVEX_URL === "YOUR_CONVEX_URL_HERE") {
  console.error("Please update CONVEX_URL in the script.");
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);

async function processLine(line) {
  if (line.trim() === "") return;

  let articleDataFromLine;
  try {
    articleDataFromLine = JSON.parse(line);

    // --- Map data from JSONL to createArticle arguments ---
    const argsForCreateArticle = {
      original_id: articleDataFromLine.original_id,
      author_wpid: articleDataFromLine.author_wpid,
      sponsored_position: articleDataFromLine.sponsored_position,
      title: articleDataFromLine.title,
      link: articleDataFromLine.link,
      source_link: articleDataFromLine.source_link,
      content: articleDataFromLine.content,
      channel: articleDataFromLine.channel,
      channel_url: articleDataFromLine.channel_url,
      secondary_channel: articleDataFromLine.secondary_channel,
      secondary_channel_url: articleDataFromLine.secondary_channel_url,
      publish_date: articleDataFromLine.publish_date,
      last_updated: articleDataFromLine.last_updated,
      image_url: articleDataFromLine.image_url,
      seo_meta: articleDataFromLine.seo_meta,
      video_url: articleDataFromLine.video_url,
      video_title: articleDataFromLine.video_title,
      audio_url: articleDataFromLine.audio_url,
      audio_file: articleDataFromLine.audio_file,
      transcript: articleDataFromLine.transcript,
      white_paper_pdf: articleDataFromLine.white_paper_pdf,
      subtitle: articleDataFromLine.subtitle,
      placefilter: articleDataFromLine.placefilter,
      rss_include: articleDataFromLine.rss_include,
      podcast_rss_include: articleDataFromLine.podcast_rss_include,
      fresh_finance_category: articleDataFromLine.fresh_finance_category,
      status: articleDataFromLine.status,
      chart_url: articleDataFromLine.chart_url,
      other: articleDataFromLine.other,
      other_meta: articleDataFromLine.other_meta,
      toolset_associations_contributor_post: articleDataFromLine.toolset_associations_contributor_post || "",
      wpcf_publishdate: articleDataFromLine.wpcf_publishdate,
      author_id: articleDataFromLine.author_id,
    };
    // --- End Data Mapping ---

    await convex.mutation(api.articles.createArticle, argsForCreateArticle);
    console.log('SUCCESS: Imported article original_id: ' + articleDataFromLine.id + ' - "' + articleDataFromLine.title.substring(0, 50) + '..."');
  } catch (error) {
    const originalId = articleDataFromLine && articleDataFromLine.id ? articleDataFromLine.id : "UNKNOWN_ID";
    console.error('ERROR importing article (original_id: ' + originalId + ', data: ' + line.substring(0, 100) + '...):', error);
  }
}

async function main() {
  console.log('Starting batch import from ' + INPUT_JSONL_FILE);
  console.log('Config: ' + MUTATIONS_PER_BATCH + ' per batch, ' + DELAY_BETWEEN_MUTATIONS_MS + 'ms between mutations, ' + DELAY_AFTER_BATCH_MS + 'ms after batch.');
  if (START_FROM_LINE > 1) {
    console.log('Attempting to start processing from line: ' + START_FROM_LINE);
  }

  let fileHandle;
  try {
    fileHandle = await fs.open(INPUT_JSONL_FILE, 'r');
  } catch (e) {
    console.error('Error opening file ' + INPUT_JSONL_FILE + ': ' + e.message);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: fileHandle.createReadStream({ encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let mutationCountInBatch = 0;
  let totalProcessed = 0;
  let currentLineNumber = 0; // Initialize line counter

  for await (const line of rl) {
    currentLineNumber++; // Increment for each line read

    if (currentLineNumber < START_FROM_LINE) {
      if (currentLineNumber % 50 === 0) { // Log progress for skipped lines occasionally
        console.log('Skipping line ' + currentLineNumber + '...');
      }
      continue; // Skip processing this line
    }

    if (totalProcessed === 0 && START_FROM_LINE > 1) { // First line being processed after skipping
      console.log('Starting actual processing from line ' + currentLineNumber + ' (original line ' + START_FROM_LINE + ')');
    }

    await processLine(line);
    totalProcessed++;
    mutationCountInBatch++;

    if (mutationCountInBatch >= MUTATIONS_PER_BATCH) {
      console.log('--- Batch of ' + mutationCountInBatch + ' processed (ending at original line approx. ' + currentLineNumber + '). Pausing for ' + (DELAY_AFTER_BATCH_MS / 1000) + 's ---');
      await new Promise(resolve => setTimeout(resolve, DELAY_AFTER_BATCH_MS));
      mutationCountInBatch = 0;
    } else {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MUTATIONS_MS));
    }
  }
  await fileHandle.close();
  console.log('Finished processing ' + totalProcessed + ' articles from ' + INPUT_JSONL_FILE + (START_FROM_LINE > 1 ? (' (started from line ' + START_FROM_LINE + ')') : '') + '.');
}

main().catch(console.error); 