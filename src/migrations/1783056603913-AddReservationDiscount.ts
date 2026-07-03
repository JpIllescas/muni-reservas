import { MigrationInterface, QueryRunner } from 'typeorm';

// FLO-2: descuento por carta/oferta (monto fijo en Q), aplicado por un ADMIN.
// `total_amount` sigue siendo el monto FINAL a pagar (ARQ-1); estas columnas
// registran cuánto se rebajó y la justificación (el original se reconstruye
// como total_amount + discount_amount). discount_applied_by va SIN FK, mismo
// criterio que proposed_by/contact_* (evita que synchronize cree en dev un FK
// que la migración no tiene).
//
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop, igual
// que RES-2 / RES-3 / FLO-1 / REC-2.
export class AddReservationDiscount1783056603913 implements MigrationInterface {
  name = 'AddReservationDiscount1783056603913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "discount_amount" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "discount_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "discount_applied_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "discount_applied_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "discount_applied_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "discount_applied_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "discount_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "discount_amount"`,
    );
  }
}
