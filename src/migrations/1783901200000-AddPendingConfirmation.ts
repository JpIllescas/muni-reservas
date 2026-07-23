import { MigrationInterface, QueryRunner } from 'typeorm';

// estado nuevo 'pending_confirmation' (cancha con boleta esperando la
// PRIMERA confirmación del admin) + re-creación de los DOS backstops.
export class AddPendingConfirmation1783901200000 implements MigrationInterface {
  name = 'AddPendingConfirmation1783901200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El estado vive en TRES tipos enum: el de reservations y los DOS de reservation_logs (from_status / to_status). Los tres necesitan el valor.
    await queryRunner.query(
      `ALTER TYPE "public"."reservations_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reservation_logs_from_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reservation_logs_to_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // Canchas: sin solapamiento de horarios entre reservas vivas.
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
    // El valor de enum NO se puede eliminar (limitación de Postgres); solo se restauran los backstops a su forma original (IN estados activos).
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
