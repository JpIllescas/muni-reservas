import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordAndEmailVerification1781243456531 implements MigrationInterface {
  name = 'AddPasswordAndEmailVerification1781243456531';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_email_verified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."otp_codes_purpose_enum" RENAME TO "otp_codes_purpose_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."otp_codes_purpose_enum" AS ENUM('login', 'register', 'password_reset')`,
    );
    await queryRunner.query(
      `ALTER TABLE "otp_codes" ALTER COLUMN "purpose" TYPE "public"."otp_codes_purpose_enum" USING "purpose"::"text"::"public"."otp_codes_purpose_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."otp_codes_purpose_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."otp_codes_purpose_enum_old" AS ENUM('login', 'register')`,
    );
    await queryRunner.query(
      `ALTER TABLE "otp_codes" ALTER COLUMN "purpose" TYPE "public"."otp_codes_purpose_enum_old" USING "purpose"::"text"::"public"."otp_codes_purpose_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."otp_codes_purpose_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."otp_codes_purpose_enum_old" RENAME TO "otp_codes_purpose_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "is_email_verified"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
  }
}
