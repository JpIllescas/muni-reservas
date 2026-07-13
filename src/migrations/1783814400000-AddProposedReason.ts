import { MigrationInterface, QueryRunner } from 'typeorm';

// CR-6: motivo de la propuesta de reasignación (RES-3). Vive y muere con la
// propuesta (se limpia a null al aceptar/rechazar, igual que proposed_*).
//
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop, igual
// que RES-2 / RES-3 / FLO-1 / REC-2 / FLO-2.
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
