import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOtpAttempts1781245877487 implements MigrationInterface {
    name = 'AddOtpAttempts1781245877487'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "otp_codes" ADD "attempts" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "otp_codes" DROP COLUMN "attempts"`);
    }

}
