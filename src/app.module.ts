import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entidades
import { User } from './modules/users/entities/user.entity';
import { UsersModule } from './modules/users/users.module';
import { OtpCode } from './modules/auth/entities/otp-code.entity';
import { Resource } from './modules/resources/entities/resource.entity';
import { ResourcesModule } from './modules/resources/resources.module';
import { ResourceSchedule } from './modules/resources/entities/resource-schedule.entity';
import { Reservation } from './modules/reservations/entities/reservation.entity';
import { ReservationLog } from './modules/reservations/entities/reservation-log.entity';
import { Payment } from './modules/payments/entities/payment.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { SystemConfig } from './modules/config/entities/system-config.entity';
import { ResourceException } from './modules/resources/entities/resource-exception.entity'

//Modulos
import { AuthModule } from './modules/auth/auth.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        ssl: {
          rejectUnauthorized: false,
        },
        entities: [
          User,
          OtpCode,
          Resource,
          ResourceSchedule,
          ResourceException,
          Reservation,
          ReservationLog,
          Payment,
          AuditLog,
          SystemConfig,
        ],
        synchronize: true, // Solo para el desarrollo, en produccion usar migracion.
        logging: true,
      }),
      inject: [ConfigService],
    }),

    // imports
    AuthModule,
    UsersModule,
    ResourcesModule,
    ReservationsModule,
  ],
})
export class AppModule {}