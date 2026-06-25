import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDB1782282213590 implements MigrationInterface {
  name = 'UpdateDB1782282213590';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // FLO-1: default true = comportamiento actual (todos exigen boleta).
    await queryRunner.query(
      `ALTER TABLE "resources" ADD "requires_voucher" boolean NOT NULL DEFAULT true`,
    );

    // El rancho de Florencia sembrado (UUID fijo) usa confirmación por llamada
    // → no exige boleta. UPDATE puntual a ESA fila, no una regla por tipo.
    await queryRunner.query(
      `UPDATE "resources" SET "requires_voucher" = false WHERE "id" = '46f3083e-eb4b-4eae-82cc-a857137996de'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" DROP COLUMN "requires_voucher"`,
    );
  }
}
