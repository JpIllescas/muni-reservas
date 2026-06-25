import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDB1782273049126 implements MigrationInterface {
  name = 'UpdateDB1782273049126';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" ADD "payment_window_hours" integer NOT NULL DEFAULT '24'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "payment_window_hours"`,
    );
  }
}
