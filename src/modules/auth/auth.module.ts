import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    NotificationsModule,
    TypeOrmModule.forFeature([User, OtpCode]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        // JWT_EXPIRES_IN admite "7d"/"24h" o un número en SEGUNDOS ("604800").
        // Gotcha: jsonwebtoken interpreta la STRING numérica como MILISEGUNDOS
        // ("604800" ≈ 10 min), por eso se convierte a number (= segundos).
        const rawExpiry = configService.get<string>('JWT_EXPIRES_IN')!;
        const expiresIn = /^\d+$/.test(rawExpiry)
          ? Number(rawExpiry)
          : (rawExpiry as import('ms').StringValue);
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
