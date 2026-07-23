import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogAppendOnly1781415648062 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // Función reusable: siempre aborta. La usan ambos triggers (fila y sentencia).
    await queryRunner.query(`
            CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'audit_logs es append-only: % no permitido', TG_OP
                    USING ERRCODE = 'check_violation';
            END;
            $$ LANGUAGE plpgsql
        `);

    // Trigger A — nivel de FILA: bloquea UPDATE y DELETE.
    await queryRunner.query(`
            CREATE TRIGGER trg_audit_logs_no_update_delete
            BEFORE UPDATE OR DELETE ON "audit_logs"
            FOR EACH ROW
            EXECUTE FUNCTION prevent_audit_log_mutation()
        `);

    // Trigger B — nivel de SENTENCIA: bloquea TRUNCATE.
    await queryRunner.query(`
            CREATE TRIGGER trg_audit_logs_no_truncate
            BEFORE TRUNCATE ON "audit_logs"
            FOR EACH STATEMENT
            EXECUTE FUNCTION prevent_audit_log_mutation()
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON "audit_logs"`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_no_update_delete ON "audit_logs"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS prevent_audit_log_mutation()`,
    );
  }
}
