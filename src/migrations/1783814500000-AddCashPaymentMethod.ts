import { MigrationInterface, QueryRunner } from 'typeorm';

// valor 'cash' en payments.method — pago en efectivo registrado por administración 
export class AddCashPaymentMethod1783814500000 implements MigrationInterface {
  name = 'AddCashPaymentMethod1783814500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."payments_method_enum" ADD VALUE IF NOT EXISTS 'cash'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres no permite eliminar un valor de un tipo enum.
  }
}
