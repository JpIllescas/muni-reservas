import { DataSource } from 'typeorm';

// Limpia todas las tablas de datos entre tests.
//
// OJO: audit_logs es append-only (migración AuditLogAppendOnly) — sus triggers
// rechazan UPDATE/DELETE/TRUNCATE. Para poder truncarla en el teardown hay que
// desactivar SUS triggers de usuario primero y reactivarlos después.
// `DISABLE TRIGGER USER` desactiva ambos (el de fila y el de TRUNCATE) sin tocar
// los triggers de sistema (FK).
export async function cleanDatabase(ds: DataSource): Promise<void> {
  await ds.query(`ALTER TABLE audit_logs DISABLE TRIGGER USER`);
  try {
    await ds.query(`
      TRUNCATE TABLE
        payments,
        reservation_logs,
        reservations,
        resource_exceptions,
        resource_schedules,
        resources,
        otp_codes,
        audit_logs,
        users
      CASCADE
    `);
  } finally {
    // Reactivar SIEMPRE, aunque el TRUNCATE falle, para no dejar la tabla
    // mutable en corridas posteriores.
    await ds.query(`ALTER TABLE audit_logs ENABLE TRIGGER USER`);
  }
}
