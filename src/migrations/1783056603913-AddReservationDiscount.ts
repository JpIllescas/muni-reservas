import { MigrationInterface, QueryRunner } from 'typeorm';

// descuento por carta/oferta (monto fijo en Q), aplicado por un ADMIN.
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
