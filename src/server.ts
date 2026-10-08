import { buildApp } from './app.js';
import { config } from './config/index.js';

async function start() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 Pharma-Verify API running at: ${address}`);
    console.log(`📚 Swagger OpenAPI documentation: ${address}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, closing server gracefully...`);
      await app.close();
      process.exit(0);
    });
  }
}

start();
