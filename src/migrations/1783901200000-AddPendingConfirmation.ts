import { MigrationInterface, QueryRunner } from 'typeorm';

// CR-4: estado nuevo 'pending_confirmation' (cancha con boleta esperando la
// PRIMERA confirmación del admin) + re-creación de los DOS backstops.
//
// Los backstops pasan de enumerar estados ACTIVOS (IN) a excluir los INACTIVOS
// (NOT IN 'cancelled','expired','rejected') por dos razones:
// 1. Postgres prohíbe USAR un valor de enum agregado en la misma transacción
//    (ALTER TYPE ADD VALUE); con NOT IN nunca se referencia el valor nuevo.
// 2. Fail-safe: cualquier estado futuro cuenta como "ocupa el slot" por
//    defecto, en vez de quedar invisible para el backstop.
//
// Escrita a mano (NO migration:generate). Esta migración ES la que toca los
// backstops a propósito — la gotcha de borrar los DROP del generate no aplica aquí.
export class AddPendingConfirmation1783901200000 implements MigrationInterface {
  name = 'AddPendingConfirmation1783901200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El estado vive en TRES tipos enum: el de reservations y los DOS de
    // reservation_logs (from_status / to_status). Los tres necesitan el valor.
    await queryRunner.query(
      `ALTER TYPE "public"."reservations_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reservation_logs_from_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reservation_logs_to_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );

    // Necesaria para el "=" sobre uuid en GiST; puede faltar en una BD que
    // nunca corrió DoubleBookingBackstop de verdad (el drift de dev).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // Canchas: sin solapamiento de horarios entre reservas vivas.
    // IF EXISTS: la BD dev perdió los backstops en la reconciliación con
    // synchronize del 2026-07-02 (synchronize no sabe crearlos y las
    // migraciones se registraron con INSERT directo) — esta migración los
    // recrea de cero donde falten.
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "excl_court_overlap"`,
    );
    await queryRunner.query(`
            ALTER TABLE "reservations"
            ADD CONSTRAINT "excl_court_overlap"
            EXCLUDE USING gist (
                resource_id WITH =,
                tsrange((reservation_date + start_time), (reservation_date + end_time)) WITH &&
            )
            WHERE (
                status NOT IN ('cancelled', 'expired', 'rejected')
                AND start_time IS NOT NULL
            )
        `);

    // Ranchos: máximo una reserva viva por recurso y fecha.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_ranch_active_booking"`);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_ranch_active_booking"
            ON "reservations" (resource_id, reservation_date)
            WHERE (
                status NOT IN ('cancelled', 'expired', 'rejected')
                AND start_time IS NULL
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El valor de enum NO se puede eliminar (limitación de Postgres); solo se
    // restauran los backstops a su forma original (IN estados activos).
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "excl_court_overlap"`,
    );
    await queryRunner.query(`
            ALTER TABLE "reservations"
            ADD CONSTRAINT "excl_court_overlap"
            EXCLUDE USING gist (
                resource_id WITH =,
                tsrange((reservation_date + start_time), (reservation_date + end_time)) WITH &&
            )
            WHERE (
                status IN ('pending_payment', 'under_review', 'approved')
                AND start_time IS NOT NULL
            )
        `);
    await queryRunner.query(`DROP INDEX "uq_ranch_active_booking"`);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_ranch_active_booking"
            ON "reservations" (resource_id, reservation_date)
            WHERE (
                status IN ('pending_payment', 'under_review', 'approved')
                AND start_time IS NULL
            )
        `);
  }
}
