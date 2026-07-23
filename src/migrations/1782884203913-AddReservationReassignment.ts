import { MigrationInterface, QueryRunner } from 'typeorm';

// reasignación de horario con aprobación del ciudadano (Shape B).
export class AddReservationReassignment1782884203913 implements MigrationInterface {
  name = 'AddReservationReassignment1782884203913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_start_time" TIME`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_end_time" TIME`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_end_time"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_start_time"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_date"`,
    );
  }
}
