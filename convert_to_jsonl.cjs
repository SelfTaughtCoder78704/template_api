const fs = require('fs');
const JSONStream = require('JSONStream');
const path = require('path');

const inputFile = path.join(__dirname, 'advisorpedia_articles-4530-5031.json');
const outputFile = path.join(__dirname, 'advisorpedia_articles-4530-5031.jsonl');

console.log('Starting conversion: ' + inputFile + ' -> ' + outputFile);

const readStream = fs.createReadStream(inputFile, { encoding: 'utf8' });
const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });

const parser = JSONStream.parse('*'); // '*' means to emit each element in the root array

let count = 0;

readStream.pipe(parser)
  .on('data', (object) => {
    try {
      writeStream.write(JSON.stringify(object) + '\n');
      count++;
      if (count % 10000 === 0) { // Log progress every 10,000 records
        console.log('Processed ' + count + ' records...');
      }
    } catch (err) {
      console.error('Error stringifying object:', err, object);
      // Decide how to handle errors: skip, log, or stop processing
    }
  })
  .on('error', (err) => {
    console.error('Error parsing JSON stream:', err);
    writeStream.end(); // Close write stream on error
  })
  .on('end', () => {
    console.log('Finished processing. Total records: ' + count);
    writeStream.end(); // Ensure write stream is closed when done
    console.log('Conversion complete. Output written to: ' + outputFile);
  });

writeStream.on('error', (err) => {
  console.error('Error writing to output file:', err);
});

readStream.on('error', (err) => {
  console.error('Error reading input file:', err);
}); 