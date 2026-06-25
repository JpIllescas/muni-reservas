import { MigrationInterface, QueryRunner } from 'typeorm';

// REC-2: estado operativo del recurso (mantenimiento / evento) + motivo.
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop
// (excl_court_overlap / uq_ranch_active_booking), igual que FLO-1.
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
    await queryRunner.query(
      `ALTER TABLE "resources" ADD "status_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "status_reason"`,
    );
    await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."resources_status_enum"`);
  }
}
