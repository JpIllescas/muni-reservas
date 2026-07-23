import { MigrationInterface, QueryRunner } from 'typeorm';

// fotos del DPI del usuario (frente y reverso)
export class AddUserDpiImages1783901000000 implements MigrationInterface {
  name = 'AddUserDpiImages1783901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "dpi_front_path" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "dpi_back_path" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "dpi_back_path"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "dpi_front_path"`);
  }
}
