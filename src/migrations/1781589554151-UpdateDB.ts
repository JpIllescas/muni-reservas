import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDB1781589554151 implements MigrationInterface {
  name = 'UpdateDB1781589554151';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" ADD "max_duration_minutes" integer DEFAULT '180'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "max_duration_minutes"`,
    );
  }
}
