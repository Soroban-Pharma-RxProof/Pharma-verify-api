import { IndexerService } from '../services/indexer.service.js';

async function main() {
  console.log('[INDEXER WORKER] Initializing Soroban event indexer worker...');
  const indexer = new IndexerService();

  process.on('SIGINT', () => {
    console.log('[INDEXER WORKER] Received SIGINT. Gracefully shutting down...');
    indexer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[INDEXER WORKER] Received SIGTERM. Gracefully shutting down...');
    indexer.stop();
    process.exit(0);
  });

  await indexer.startPolling(4000);
}

main().catch((err) => {
  console.error('[INDEXER WORKER] Fatal error:', err);
  process.exit(1);
});
