import { MigrationInterface, QueryRunner } from 'typeorm';

// estado operativo del recurso (mantenimiento / evento) + motivo. Escrita a mano.
export class AddResourceStatus1782365014504 implements MigrationInterface {
  name = 'AddResourceStatus1782365014504';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."resources_status_enum" AS ENUM('available', 'maintenance', 'event')`,
    );
    // NOT NULL con default: Postgres backfilea las filas existentes con 'available'.
    await queryRunner.query(
      `ALTER TABLE "resources" ADD "status" "public"."resources_status_enum" NOT NULL DEFAULT 'available'`,
    );
    await queryRunner.query(`ALTER TABLE "resources" ADD "status_reason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "status_reason"`,
    );
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."resources_status_enum"`);
  }
}
