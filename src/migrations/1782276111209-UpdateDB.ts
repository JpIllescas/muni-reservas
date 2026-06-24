import { MigrationInterface, QueryRunner } from "typeorm";

// ADM-1: modelo de Sede. UUIDs fijos para las dos sedes reales, así el seed y
// las máquinas nuevas referencian las mismas.
const SEDE_POLVORA_ID = '11111111-1111-4111-8111-111111111111';
const SEDE_FLORENCIA_ID = '22222222-2222-4222-8222-222222222222';

export class UpdateDB1782276111209 implements MigrationInterface {
    name = 'UpdateDB1782276111209'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Tabla de sedes.
        await queryRunner.query(`CREATE TABLE "sedes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_41c72fb81a5cce86521b22f5045" UNIQUE ("name"), CONSTRAINT "PK_842a6b0ebcf810b57487748b822" PRIMARY KEY ("id"))`);

        // 2. Sembrar las dos sedes reales (idempotente vía UUID fijo).
        await queryRunner.query(`
            INSERT INTO "sedes" ("id", "name", "address") VALUES
                ($1, 'Complejo Deportivo La Pólvora', 'La Antigua Guatemala'),
                ($2, 'Parque Ecológico Florencia', 'La Antigua Guatemala')
        `, [SEDE_POLVORA_ID, SEDE_FLORENCIA_ID]);

        // 3. Tabla puente user_sedes (M2M admin/operador ↔ sede).
        await queryRunner.query(`CREATE TABLE "user_sedes" ("user_id" uuid NOT NULL, "sede_id" uuid NOT NULL, CONSTRAINT "PK_a988a3c4869441e90c7b24269da" PRIMARY KEY ("user_id", "sede_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_535db815d07ae41f1499333f6c" ON "user_sedes" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_cef1b160cd22f22ef39934a93e" ON "user_sedes" ("sede_id") `);

        // 4. Flag super-admin.
        await queryRunner.query(`ALTER TABLE "users" ADD "is_super_admin" boolean NOT NULL DEFAULT false`);

        // 5. Los ADMIN existentes se promueven a super-admin: conservan el acceso
        //    global que tenían antes de ADM-1 (no se bloquean). Los nuevos admins
        //    se crean acotados por sede. (Los operadores quedan sin sede → no ven
        //    nada hasta que se les asigne: fail-closed, lo buscado.)
        await queryRunner.query(`UPDATE "users" SET "is_super_admin" = true WHERE "role" = 'admin'`);

        // 6. sede_id en recursos: primero NULLABLE para no romper filas existentes.
        await queryRunner.query(`ALTER TABLE "resources" ADD "sede_id" uuid`);

        // 7. Backfill por el texto de location (el seed lo trae limpio); cualquier
        //    recurso sin coincidencia cae en La Pólvora por defecto.
        await queryRunner.query(`UPDATE "resources" SET "sede_id" = $1 WHERE "sede_id" IS NULL AND "location" ILIKE '%pólvora%'`, [SEDE_POLVORA_ID]);
        await queryRunner.query(`UPDATE "resources" SET "sede_id" = $1 WHERE "sede_id" IS NULL AND "location" ILIKE '%florencia%'`, [SEDE_FLORENCIA_ID]);
        await queryRunner.query(`UPDATE "resources" SET "sede_id" = $1 WHERE "sede_id" IS NULL`, [SEDE_POLVORA_ID]);

        // 8. Ya con todas las filas pobladas, fijamos NOT NULL.
        await queryRunner.query(`ALTER TABLE "resources" ALTER COLUMN "sede_id" SET NOT NULL`);

        // 9. Índice + FKs.
        await queryRunner.query(`CREATE INDEX "IDX_d4baca113d2dddb0b9c04ced1f" ON "resources" ("sede_id") `);
        await queryRunner.query(`ALTER TABLE "resources" ADD CONSTRAINT "FK_d4baca113d2dddb0b9c04ced1ff" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_sedes" ADD CONSTRAINT "FK_535db815d07ae41f1499333f6c2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_sedes" ADD CONSTRAINT "FK_cef1b160cd22f22ef39934a93ef" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_sedes" DROP CONSTRAINT "FK_cef1b160cd22f22ef39934a93ef"`);
        await queryRunner.query(`ALTER TABLE "user_sedes" DROP CONSTRAINT "FK_535db815d07ae41f1499333f6c2"`);
        await queryRunner.query(`ALTER TABLE "resources" DROP CONSTRAINT "FK_d4baca113d2dddb0b9c04ced1ff"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d4baca113d2dddb0b9c04ced1f"`);
        await queryRunner.query(`ALTER TABLE "resources" DROP COLUMN "sede_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_super_admin"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cef1b160cd22f22ef39934a93e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_535db815d07ae41f1499333f6c"`);
        await queryRunner.query(`DROP TABLE "user_sedes"`);
        await queryRunner.query(`DROP TABLE "sedes"`);
    }

}
