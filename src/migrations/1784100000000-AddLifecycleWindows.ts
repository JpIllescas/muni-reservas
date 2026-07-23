import { MigrationInterface, QueryRunner } from 'typeorm';

// Ventanas de ciclo de vida
export class AddLifecycleWindows1784100000000 implements MigrationInterface {
  name = 'AddLifecycleWindows1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" ADD COLUMN "confirmation_window_hours" integer NOT NULL DEFAULT 24`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ADD COLUMN "validation_window_minutes" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD COLUMN "review_reminded_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "review_reminded_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "validation_window_minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "confirmation_window_hours"`,
    );
  }
}
