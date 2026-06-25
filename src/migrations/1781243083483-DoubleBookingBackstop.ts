import { MigrationInterface, QueryRunner } from 'typeorm';

export class DoubleBookingBackstop1781243083483 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // btree_gist permite usar "=" sobre uuid dentro de un índice GiST,
    // necesario para combinar resource_id (=) con el rango de horas (&&).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // --- CANCHAS (COURT): sin solapamiento de horarios ---
    // Una "exclusion constraint" rechaza dos filas que, para el MISMO recurso,
    // tengan rangos de tiempo que se solapen (&&). Construimos el rango como
    // tsrange(fecha+hora_inicio, fecha+hora_fin) con límites [inicio, fin):
    // el fin es exclusivo, así una reserva 10:00-11:00 NO choca con 11:00-12:00.
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
    // Los ranchos son de día completo (start_time/end_time NULL), así que la
    // constraint de arriba no los cubre. Un índice único PARCIAL garantiza que
    // no exista más de una reserva activa para el mismo recurso en la misma fecha.
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
    // No quitamos la extensión btree_gist por si otra cosa la usa.
  }
}
