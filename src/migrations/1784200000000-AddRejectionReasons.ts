import { MigrationInterface, QueryRunner } from 'typeorm';

// Catálogo de motivos de rechazo + FK en reservations (para reportes por motivo).
// El "no autorizado" de la muni entra como un motivo sembrado; NO es un estado
// nuevo: la reserva sigue en 'rejected'.
export class AddRejectionReasons1784200000000 implements MigrationInterface {
  name = 'AddRejectionReasons1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rejection_reasons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "label_admin" character varying NOT NULL,
        "message_citizen" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rejection_reasons" PRIMARY KEY ("id")
      )
    `);

    // Motivos por defecto. "No autorizado" es el que motiva la función.
    await queryRunner.query(`
      INSERT INTO "rejection_reasons" ("label_admin", "message_citizen", "sort_order") VALUES
      ('No autorizado', 'Tu solicitud no fue autorizada por la administración municipal.', 1),
      ('Boleta no coincide', 'El comprobante de pago no coincide con el monto o los datos de la reserva.', 2),
      ('Fecha en conflicto', 'La fecha solicitada ya no está disponible.', 3),
      ('Fuera de política', 'La solicitud no cumple con las políticas de uso del recurso.', 4)
    `);

    // FK opcional en reservations (reporte por motivo). ON DELETE SET NULL: si se
    // borrara un motivo, la reserva conserva su texto en rejection_reason.
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD COLUMN "rejection_reason_id" uuid,
      ADD CONSTRAINT "FK_reservations_rejection_reason"
        FOREIGN KEY ("rejection_reason_id") REFERENCES "rejection_reasons"("id")
        ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "FK_reservations_rejection_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP COLUMN "rejection_reason_id"`,
    );
    await queryRunner.query(`DROP TABLE "rejection_reasons"`);
  }
}
