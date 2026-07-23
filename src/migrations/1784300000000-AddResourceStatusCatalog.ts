import { MigrationInterface, QueryRunner } from 'typeorm';

// REC-2 (escalable): convierte el estado del recurso de un enum fijo a un
// CATÁLOGO (resource_statuses) con flags de comportamiento. resources.status pasa
// de enum a varchar con FK -> resource_statuses(key). El comportamiento (¿bloquea
// reservas?) cuelga del flag blocks_reservations, no del nombre del estado.
//
// Escrita a mano (NO migration:generate) para no re-DROPear los backstops.
// Orden crítico (Postgres no castea el DEFAULT del enum solo): sembrar el catálogo
// -> DROP DEFAULT -> TYPE varchar -> SET DEFAULT -> FK -> DROP TYPE.
export class AddResourceStatusCatalog1784300000000 implements MigrationInterface {
  name = 'AddResourceStatusCatalog1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Catálogo.
    await queryRunner.query(`
      CREATE TABLE "resource_statuses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" character varying NOT NULL,
        "label" character varying NOT NULL,
        "blocks_reservations" boolean NOT NULL DEFAULT false,
        "visible_in_catalog" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "color" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resource_statuses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resource_statuses_key" UNIQUE ("key")
      )
    `);

    // Un solo default (respalda que 'available' sea el único is_default = true).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_resource_status_default"
      ON "resource_statuses" ("is_default") WHERE "is_default" = true
    `);

    // 2. Semilla: los 3 estados que existían como enum. 'available' es el default
    //    (espeja el DEFAULT de la columna). maintenance/event bloquean reservas.
    await queryRunner.query(`
      INSERT INTO "resource_statuses"
        ("key", "label", "blocks_reservations", "visible_in_catalog", "is_default", "color", "sort_order")
      VALUES
        ('available',   'Disponible',       false, true, true,  '#16a34a', 1),
        ('maintenance', 'En mantenimiento', true,  true, false, '#d97706', 2),
        ('event',       'Evento',           true,  true, false, '#2563eb', 3)
    `);

    // 3. resources.status: enum -> varchar (el DEFAULT del enum debe caer primero).
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" TYPE character varying USING "status"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" SET DEFAULT 'available'`,
    );

    // 4. FK por key (los recursos existentes ya traen 'available'/'maintenance'/
    //    'event', que están sembrados, así que no viola). Sin ON DELETE/UPDATE:
    //    RESTRICT por defecto -> no se borra un estado en uso ni se renombra su key.
    await queryRunner.query(`
      ALTER TABLE "resources"
      ADD CONSTRAINT "FK_resources_status"
        FOREIGN KEY ("status") REFERENCES "resource_statuses"("key")
    `);

    // 5. El enum ya no lo usa nadie.
    await queryRunner.query(`DROP TYPE "public"."resources_status_enum"`);
  }

  // NOTA: down() solo revierte limpiamente los 3 estados sembrados. Si un admin
  // creó una key nueva, el cast de vuelta al enum lanza (valor no permitido).
  // Limitación aceptada: el rollback es una herramienta de desarrollo.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."resources_status_enum" AS ENUM('available', 'maintenance', 'event')`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" DROP CONSTRAINT "FK_resources_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" TYPE "public"."resources_status_enum" USING "status"::"public"."resources_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resources" ALTER COLUMN "status" SET DEFAULT 'available'`,
    );
    await queryRunner.query(`DROP TABLE "resource_statuses"`);
  }
}
