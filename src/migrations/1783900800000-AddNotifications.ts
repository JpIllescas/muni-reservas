import { MigrationInterface, QueryRunner } from 'typeorm';

// tabla de notificaciones en el sistema 
export class AddNotifications1783900800000 implements MigrationInterface {
  name = 'AddNotifications1783900800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "message" text NOT NULL,
        "reservation_id" uuid,
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_read" ON "notifications" ("user_id", "is_read")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_created" ON "notifications" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_notifications_user_created"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_user_read"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
