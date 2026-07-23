import { MigrationInterface, QueryRunner } from 'typeorm';

// horario especial / override por fecha (tabla resource_schedule_overrides).
export class AddResourceScheduleOverride1782970603913 implements MigrationInterface {
  name = 'AddResourceScheduleOverride1782970603913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_schedule_overrides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "resource_id" uuid NOT NULL, "override_date" date NOT NULL, "open_time" TIME NOT NULL, "close_time" TIME NOT NULL, "slot_duration_min" integer, "created_by_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_resource_schedule_overrides" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_schedule_overrides" ADD CONSTRAINT "FK_rso_resource" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_schedule_overrides" ADD CONSTRAINT "FK_rso_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "resource_schedule_overrides" DROP CONSTRAINT "FK_rso_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "resource_schedule_overrides" DROP CONSTRAINT "FK_rso_resource"`,
    );
    await queryRunner.query(`DROP TABLE "resource_schedule_overrides"`);
  }
}
