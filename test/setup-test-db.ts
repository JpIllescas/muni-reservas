import { Client } from 'pg';
import { testDatabaseUrl } from './test-data-source';

// Crea la base muni_reservas_test si no existe. CREATE DATABASE no puede correr
// dentro de una transacción ni vía migración, así que se conecta a la base de
// mantenimiento "postgres" para emitirlo.
async function main() {
  const target = new URL(testDatabaseUrl);
  const dbName = target.pathname.replace(/^\//, '');

  if (!dbName.endsWith('_test')) {
    throw new Error(`Negativa de seguridad: la BD objetivo no termina en _test: ${dbName}`);
  }

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.rowCount === 0) {
      // dbName viene de nuestra propia URL derivada (no input externo), pero lo
      // citamos igual para no romper si llevara caracteres especiales.
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Base de test creada: ${dbName}`);
    } else {
      console.log(`Base de test ya existía: ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
