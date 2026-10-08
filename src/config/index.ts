import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/pharma_rxproof?schema=public'),

  STELLAR_NETWORK: z.string().default('testnet'),
  STELLAR_RPC_URL: z.string().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  HORIZON_URL: z.string().default('https://horizon-testnet.stellar.org'),

  RXPROOF_CONTRACT_ID: z.string().default('CA2JMBWAT2DDZZHCULUJXWBZ7N27QO2LRADSPNR4CDUULBWIGCJ2CAZO'),
  CONTRACT_ID: z.string().optional(),
  ADMIN_SECRET_KEY: z.string().optional(),
  REGULATOR_SECRET_KEY: z.string().optional(),

  JWT_SECRET: z.string().default('default-rxproof-jwt-secret-key-32-chars-long!'),
  SEP10_HOME_DOMAIN: z.string().default('rxproof.pharma.org'),
  SEP10_SIGNING_KEY: z.string().optional(),
  SERVER_SIGNING_KEY: z.string().optional(),
  AES_ENCRYPTION_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().default('pharma-documents'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  ALERT_WEBHOOK_URL: z.string().optional(),
  ALERT_EMAIL_RECIPIENT: z.string().default('regulator-alerts@pharma-rxproof.org'),
});

const parsed = envSchema.parse(process.env);

export const config = {
  ...parsed,
  CONTRACT_ID: parsed.CONTRACT_ID || parsed.RXPROOF_CONTRACT_ID,
  SERVER_SIGNING_KEY: parsed.SERVER_SIGNING_KEY || parsed.SEP10_SIGNING_KEY,
};

export type Config = typeof config;
