import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateDB1782267988810 implements MigrationInterface {
  name = 'UpdateDB1782267988810';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "total_amount" numeric(10,2)`,
    );

    await queryRunner.query(`
            UPDATE "reservations" r
            SET "total_amount" = ROUND(
                res."price_per_unit" * CASE
                    WHEN r."start_time" IS NOT NULL AND r."end_time" IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (r."end_time" - r."start_time")) / 3600.0
                    ELSE 1
                END, 2)
            FROM "resources" res
            WHERE res."id" = r."resource_id"
        `);

    // Salvaguarda defensiva por si alguna fila quedara sin monto (la FK lo impide en la práctica).
    await queryRunner.query(
      `UPDATE "reservations" SET "total_amount" = 0 WHERE "total_amount" IS NULL`,
    );

    // Ya con todas las filas pobladas, fijamos la restricción definitiva.
    await queryRunner.query(
      `ALTER TABLE "reservations" ALTER COLUMN "total_amount" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "total_amount"`,
    );
  }
}
