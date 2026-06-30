import { MigrationInterface, QueryRunner } from 'typeorm';

// RES-2: datos de contacto del encargado en la reserva (nombre + teléfono).
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop
// (excl_court_overlap / uq_ranch_active_booking), igual que FLO-1 / REC-2.
// Columnas nullable: obligatorias en el DTO, pero las reservas previas a RES-2
// se quedan con null sin romper la migración.
export class AddReservationContact1782797803913 implements MigrationInterface {
  name = 'AddReservationContact1782797803913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "contact_phone" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "contact_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "contact_name"`,
    );
  }
}
