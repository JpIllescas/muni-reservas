import { MigrationInterface, QueryRunner } from 'typeorm';

// la ventana de pago de canchas pasa de 24h a 2h
export class CourtPaymentWindow2h1784000000000 implements MigrationInterface {
  name = 'CourtPaymentWindow2h1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "payment_window_hours" SET DEFAULT 2`,
    );
    await queryRunner.query(
      `UPDATE "resources" SET "payment_window_hours" = 2 WHERE "type" = 'court' AND "payment_window_hours" = 24`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "payment_window_hours" SET DEFAULT 24`,
    );
    await queryRunner.query(
      `UPDATE "resources" SET "payment_window_hours" = 24 WHERE "type" = 'court' AND "payment_window_hours" = 2`,
    );
  }
}
