import { MigrationInterface, QueryRunner } from 'typeorm';

// RES-3: reasignación de horario con aprobación del ciudadano (Shape B).
// El admin/operador PROPONE una nueva fecha/hora en columnas `proposed_*`; la
// reserva conserva su estado y NO ocupa el slot nuevo hasta que el ciudadano
// acepta. Al aceptar, las columnas reales cambian y el backstop de BD
// (excl_court_overlap / uq_ranch_active_booking) actúa como red final.
//
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop, igual
// que RES-2 / FLO-1 / REC-2. Columnas nullable: solo tienen valor mientras hay
// una propuesta viva; se limpian al aceptar o rechazar.
export class AddReservationReassignment1782884203913
  implements MigrationInterface
{
  name = 'AddReservationReassignment1782884203913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_start_time" TIME`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_end_time" TIME`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD "proposed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_end_time"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_start_time"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "proposed_date"`,
    );
  }
}
