import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';

// Entidades
import { User } from './modules/users/entities/user.entity';
import { UsersModule } from './modules/users/users.module';
import { OtpCode } from './modules/auth/entities/otp-code.entity';
import { Resource } from './modules/resources/entities/resource.entity';
import { Sede } from './modules/resources/entities/sede.entity';
import { ResourcesModule } from './modules/resources/resources.module';
import { ResourceSchedule } from './modules/resources/entities/resource-schedule.entity';
import { Reservation } from './modules/reservations/entities/reservation.entity';
import { ReservationLog } from './modules/reservations/entities/reservation-log.entity';
import { Payment } from './modules/payments/entities/payment.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { SystemConfig } from './modules/config/entities/system-config.entity';
import { ResourceException } from './modules/resources/entities/resource-exception.entity';

//Modulos
import { AuthModule } from './modules/auth/auth.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditModule } from './modules/audit/audit.module';
import { ConfigDbModule } from './modules/config/config-db.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        DB_SSL: Joi.string().valid('true', 'false').default('false'),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        MAIL_HOST: Joi.string().required(),
        MAIL_PORT: Joi.number().required(),
        MAIL_USER: Joi.string().required(),
        MAIL_PASS: Joi.string().required(),
        PORT: Joi.number().default(3000),
        FRONTEND_URL: Joi.string().optional(),
      }),
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          ssl: configService.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
          entities: [
            User,
            OtpCode,
            Resource,
            Sede,
            ResourceSchedule,
            ResourceException,
            Reservation,
            ReservationLog,
            Payment,
            AuditLog,
            SystemConfig,
          ],
          synchronize: !isProd,
          logging: isProd ? ['error', 'warn'] : true,
        };
      },
      inject: [ConfigService],
    }),

    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),

    // imports
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    ResourcesModule,
    ReservationsModule,
    PaymentsModule,
    NotificationsModule,
    ReportsModule,
    AuditModule,
    ConfigDbModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
