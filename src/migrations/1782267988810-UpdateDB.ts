import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateDB1782267988810 implements MigrationInterface {
    name = 'UpdateDB1782267988810'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ARQ-1: monto total persistido en backend.
        // Se agrega NULLABLE primero para no romper las reservas ya existentes.
        await queryRunner.query(`ALTER TABLE "reservations" ADD "total_amount" numeric(10,2)`);

        // Backfill del monto histórico: precio del recurso × horas (canchas) o × 1 (ranchos).
        // En ranchos start/end son NULL → se cobra el día completo (1 unidad).
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
        await queryRunner.query(`UPDATE "reservations" SET "total_amount" = 0 WHERE "total_amount" IS NULL`);

        // Ya con todas las filas pobladas, fijamos la restricción definitiva.
        await queryRunner.query(`ALTER TABLE "reservations" ALTER COLUMN "total_amount" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "total_amount"`);
    }

}
