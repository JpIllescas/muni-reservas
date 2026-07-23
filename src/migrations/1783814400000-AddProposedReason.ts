import { MigrationInterface, QueryRunner } from 'typeorm';

// motivo de la propuesta de reasignación.
export class AddProposedReason1783814400000 implements MigrationInterface {
  name = 'AddProposedReason1783814400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_reason"`,
    );
  }
}
