import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`[config] missing required env: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '9532')),
  publicDomain: optional('PUBLIC_DOMAIN', 'p12.sumzip.com'),

  db: {
    host: optional('DB_HOST', '127.0.0.1'),
    port: Number(optional('DB_PORT', '3306')),
    user: optional('DB_USER', 'app'),
    password: optional('DB_PASSWORD', ''),
    database: optional('DB_NAME', 'ai_store_ops'),
  },

  session: {
    secret: optional('SESSION_SECRET', 'dev-only-change-me'),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-only-change-me'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  adapters: {
    pos: optional('ADAPTER_POS', 'mock'),
    forecast: optional('ADAPTER_FORECAST', 'baseline'),
    push: optional('ADAPTER_PUSH', 'mock'),
    esl: optional('ADAPTER_ESL', 'mock'),
    logistics: optional('ADAPTER_LOGISTICS', 'mock'),
    signal: optional('ADAPTER_SIGNAL', 'mock'),
    vision: optional('ADAPTER_VISION', 'mock'),
  },
};

export { required };
