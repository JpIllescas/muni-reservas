import { MigrationInterface, QueryRunner } from "typeorm";

export class AuditLogAppendOnly1781415648062 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- AUDITORÍA APPEND-ONLY (log inmutable fiscalizable por la CGC) ---
        // Requisito: el historial de acciones administrativas no puede modificarse
        // ni borrarse una vez escrito. No basta con REVOKE: en dev la app conecta
        // como superusuario (postgres) y en prod el dueño de la tabla conserva sus
        // privilegios pase lo que pase, así que un REVOKE no los detendría.
        //
        // Un trigger que lanza una excepción bloquea la mutación para CUALQUIER rol
        // (incluido superusuario y dueño), salvo que alguien deshabilite el trigger
        // a mano (operación que ya queda registrada fuera del flujo normal de la app).
        // Es el mismo patrón de "backstop a nivel BD" que excl_court_overlap.

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
        // INSERT queda fuera a propósito (createLog debe seguir funcionando).
        await queryRunner.query(`
            CREATE TRIGGER trg_audit_logs_no_update_delete
            BEFORE UPDATE OR DELETE ON "audit_logs"
            FOR EACH ROW
            EXECUTE FUNCTION prevent_audit_log_mutation()
        `);

        // Trigger B — nivel de SENTENCIA: bloquea TRUNCATE.
        // Necesario porque TRUNCATE NO dispara triggers de fila y vaciaría toda la
        // tabla de un golpe. PostgreSQL no permite mezclar eventos de fila y de
        // sentencia en un mismo CREATE TRIGGER, por eso van separados.
        await queryRunner.query(`
            CREATE TRIGGER trg_audit_logs_no_truncate
            BEFORE TRUNCATE ON "audit_logs"
            FOR EACH STATEMENT
            EXECUTE FUNCTION prevent_audit_log_mutation()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON "audit_logs"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_update_delete ON "audit_logs"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_audit_log_mutation()`);
    }

}
