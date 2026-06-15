import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Reutilizamos las credenciales del .env de dev pero apuntando a OTRA base:
// muni_reservas_test. NUNCA tocamos la base de dev (sus datos se perderían en
// el teardown de los tests).
config();

function toTestUrl(url: string): string {
  const u = new URL(url);
  let db = u.pathname.replace(/^\//, '');
  if (!db.endsWith('_test')) {
    db = `${db}_test`;
  }
  u.pathname = `/${db}`;
  return u.toString();
}

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error('DATABASE_URL no está definido en .env (necesario para derivar la BD de test).');
}

export const testDatabaseUrl = toTestUrl(baseUrl);

// SALVAGUARDA: jamás correr los tests (que truncan tablas) contra una base que
// no sea explícitamente la de test.
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error(`BD de test inválida (no termina en _test): ${testDatabaseUrl}`);
}

export const testDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: testDatabaseUrl,
  ssl: false,
  entities: [join(__dirname, '..', 'src', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'src', 'migrations', '*.{ts,js}')],
  synchronize: false,
};

// Export default para el CLI de TypeORM (migration:run:test).
export default new DataSource(testDataSourceOptions);
