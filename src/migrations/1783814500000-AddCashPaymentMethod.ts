import { MigrationInterface, QueryRunner } from 'typeorm';

// CR-5/CR-7: valor 'cash' en payments.method — pago en efectivo registrado por
// administración (boleta cargada por admin en cancha / aprobación de Florencia
// con número de boleta).
//
// IF NOT EXISTS: idempotente frente a synchronize en dev (si el watch ya agregó
// el valor al tipo, la migración igual corre y queda registrada).
//
// Escrita a mano (NO migration:generate) para no re-DROPear el backstop, igual
// que las anteriores.
export class AddCashPaymentMethod1783814500000 implements MigrationInterface {
  name = 'AddCashPaymentMethod1783814500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."payments_method_enum" ADD VALUE IF NOT EXISTS 'cash'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres no permite eliminar un valor de un tipo enum. Quitarlo exigiría
    // recrear el tipo y reescribir la columna; no vale la pena para un revert.
    // El valor 'cash' sin filas que lo usen es inocuo.
  }
}
