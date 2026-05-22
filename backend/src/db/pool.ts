import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { config } from '../config';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const opts: PoolOptions = {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
    timezone: 'Z',
    decimalNumbers: true,
  };
  _pool = mysql.createPool(opts);
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
