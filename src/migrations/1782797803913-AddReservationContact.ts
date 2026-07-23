import { MigrationInterface, QueryRunner } from 'typeorm';

// datos de contacto del encargado en la reserva (nombre + teléfono).
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
