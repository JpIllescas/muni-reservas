import { MigrationInterface, QueryRunner } from 'typeorm';

export class DoubleBookingBackstop1781243083483 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // necesario para combinar resource_id (=) con el rango de horas (&&).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // --- CANCHAS (COURT): sin solapamiento de horarios ---
    // Una "exclusion constraint" rechaza dos filas que, para el MISMO recurso, tengan rangos de tiempo que se solapen (&&).
    // Solo aplica a filas activas y con horario (las de cancha tienen start_time).
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

    // --- RANCHOS (RANCH): una sola reserva activa por recurso y día ---
    // Los ranchos son de día completo (start_time/end_time NULL).
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_ranch_active_booking"
            ON "reservations" (resource_id, reservation_date)
            WHERE (
                status IN ('pending_payment', 'under_review', 'approved')
                AND start_time IS NULL
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_ranch_active_booking"`);
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "excl_court_overlap"`,
    );
  }
}
