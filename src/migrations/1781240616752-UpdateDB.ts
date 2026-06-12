import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateDB1781240616752 implements MigrationInterface {
    name = 'UpdateDB1781240616752'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Requerida por uuid_generate_v4() en los DEFAULT de todas las tablas
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('citizen', 'operator', 'admin')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "email" character varying NOT NULL, "dpi" character varying, "phone" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'citizen', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_285ed4027d167fd706cb2a2b9ce" UNIQUE ("dpi"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TYPE "public"."resources_type_enum" AS ENUM('court', 'ranch')`);
        await queryRunner.query(`CREATE TABLE "resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "type" "public"."resources_type_enum" NOT NULL, "location" character varying, "capacity" integer, "price_per_unit" numeric(10,2) NOT NULL, "rules" text, "advance_days" integer NOT NULL DEFAULT '7', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_632484ab9dff41bba94f9b7c85e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "resource_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "resource_id" uuid NOT NULL, "day_of_week" smallint NOT NULL, "open_time" TIME NOT NULL, "close_time" TIME NOT NULL, "slot_duration_min" integer, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_649d2be001947186a454eeb1804" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "resource_exceptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "resource_id" uuid NOT NULL, "exception_date" date NOT NULL, "reason" text NOT NULL, "created_by_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_90ff52082238ee43a5f6d54dfa9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."reservations_status_enum" AS ENUM('pending_payment', 'under_review', 'approved', 'rejected', 'expired', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "resource_id" uuid NOT NULL, "reservation_date" date NOT NULL, "start_time" TIME, "end_time" TIME, "status" "public"."reservations_status_enum" NOT NULL DEFAULT 'pending_payment', "payment_deadline" TIMESTAMP WITH TIME ZONE, "confirmed_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_da95cef71b617ac35dc5bcda243" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4af5055a871c46d011345a255a" ON "reservations" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_367cc7e5b7a79fe08066d82fd6" ON "reservations" ("resource_id", "reservation_date") `);
        await queryRunner.query(`CREATE INDEX "IDX_0244b15cc3f52c07735d2ea76d" ON "reservations" ("status", "payment_deadline") `);
        await queryRunner.query(`CREATE TYPE "public"."reservation_logs_from_status_enum" AS ENUM('pending_payment', 'under_review', 'approved', 'rejected', 'expired', 'cancelled')`);
        await queryRunner.query(`CREATE TYPE "public"."reservation_logs_to_status_enum" AS ENUM('pending_payment', 'under_review', 'approved', 'rejected', 'expired', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "reservation_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reservation_id" uuid NOT NULL, "from_status" "public"."reservation_logs_from_status_enum", "to_status" "public"."reservation_logs_to_status_enum" NOT NULL, "changed_by" uuid, "reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_74871dcf9ed2c7df8d0519d6645" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('voucher', 'online')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reservation_id" uuid NOT NULL, "method" "public"."payments_method_enum" NOT NULL DEFAULT 'voucher', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "voucher_path" character varying, "voucher_original_name" character varying, "voucher_size_bytes" bigint, "transaction_reference" character varying, "submitted_at" TIMESTAMP WITH TIME ZONE, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "notes" text, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "system_config" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "value" text NOT NULL, "description" text, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_by" uuid, CONSTRAINT "UQ_eedd3cd0f227c7fb5eff2204e93" UNIQUE ("key"), CONSTRAINT "PK_db4e70ac0d27e588176e9bb44a0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_eedd3cd0f227c7fb5eff2204e9" ON "system_config" ("key") `);
        await queryRunner.query(`CREATE TYPE "public"."otp_codes_purpose_enum" AS ENUM('login', 'register')`);
        await queryRunner.query(`CREATE TABLE "otp_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "code" character varying(6) NOT NULL, "purpose" "public"."otp_codes_purpose_enum" NOT NULL, "used" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9d0487965ac1837d57fec4d6a26" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_26eb05139ce60703f60cd1a2bf" ON "otp_codes" ("expires_at") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "performed_by" uuid, "entity_type" character varying NOT NULL, "entity_id" character varying, "action" character varying NOT NULL, "old_value" jsonb, "new_value" jsonb, "ip_address" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "resource_schedules" ADD CONSTRAINT "FK_40bfd8bd93d5b1f86738fcb2c62" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "resource_exceptions" ADD CONSTRAINT "FK_7ee6449c8fdd04ded5bbe440e9c" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "resource_exceptions" ADD CONSTRAINT "FK_c9630bb9b585d460314df82916f" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservations" ADD CONSTRAINT "FK_4af5055a871c46d011345a255a6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservations" ADD CONSTRAINT "FK_867b5da4d2d48942325efa3a828" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservation_logs" ADD CONSTRAINT "FK_4194cbece7719eaae50784de32e" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservation_logs" ADD CONSTRAINT "FK_62fb1944dfe33dfdbcd1c6051da" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_9ed5ff4942e09edfd44ee0ccf01" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_9753b8e19c636406e4aeab6d32c" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "system_config" ADD CONSTRAINT "FK_674473bbaa9859ba7e7d9f7ea9e" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "otp_codes" ADD CONSTRAINT "FK_318b850fc020b1e0f8670f66e12" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_ae97aac6d6d471b9d88cea1c971" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_ae97aac6d6d471b9d88cea1c971"`);
        await queryRunner.query(`ALTER TABLE "otp_codes" DROP CONSTRAINT "FK_318b850fc020b1e0f8670f66e12"`);
        await queryRunner.query(`ALTER TABLE "system_config" DROP CONSTRAINT "FK_674473bbaa9859ba7e7d9f7ea9e"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_9753b8e19c636406e4aeab6d32c"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_9ed5ff4942e09edfd44ee0ccf01"`);
        await queryRunner.query(`ALTER TABLE "reservation_logs" DROP CONSTRAINT "FK_62fb1944dfe33dfdbcd1c6051da"`);
        await queryRunner.query(`ALTER TABLE "reservation_logs" DROP CONSTRAINT "FK_4194cbece7719eaae50784de32e"`);
        await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_867b5da4d2d48942325efa3a828"`);
        await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_4af5055a871c46d011345a255a6"`);
        await queryRunner.query(`ALTER TABLE "resource_exceptions" DROP CONSTRAINT "FK_c9630bb9b585d460314df82916f"`);
        await queryRunner.query(`ALTER TABLE "resource_exceptions" DROP CONSTRAINT "FK_7ee6449c8fdd04ded5bbe440e9c"`);
        await queryRunner.query(`ALTER TABLE "resource_schedules" DROP CONSTRAINT "FK_40bfd8bd93d5b1f86738fcb2c62"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_26eb05139ce60703f60cd1a2bf"`);
        await queryRunner.query(`DROP TABLE "otp_codes"`);
        await queryRunner.query(`DROP TYPE "public"."otp_codes_purpose_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eedd3cd0f227c7fb5eff2204e9"`);
        await queryRunner.query(`DROP TABLE "system_config"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`DROP TABLE "reservation_logs"`);
        await queryRunner.query(`DROP TYPE "public"."reservation_logs_to_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."reservation_logs_from_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0244b15cc3f52c07735d2ea76d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_367cc7e5b7a79fe08066d82fd6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4af5055a871c46d011345a255a"`);
        await queryRunner.query(`DROP TABLE "reservations"`);
        await queryRunner.query(`DROP TYPE "public"."reservations_status_enum"`);
        await queryRunner.query(`DROP TABLE "resource_exceptions"`);
        await queryRunner.query(`DROP TABLE "resource_schedules"`);
        await queryRunner.query(`DROP TABLE "resources"`);
        await queryRunner.query(`DROP TYPE "public"."resources_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
