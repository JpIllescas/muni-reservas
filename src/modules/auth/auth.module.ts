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
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        return {
          secret,
          signOptions: {
            // Antes estaba hardcodeado en 604800 (7d). Ahora respeta la variable
            // de entorno JWT_EXPIRES_IN (exigida por Joi), p. ej. "7d". El cast
            // es porque jsonwebtoken tipa expiresIn como el literal StringValue
            // de `ms`, no como un string genérico.
            expiresIn: configService.get<string>(
              'JWT_EXPIRES_IN',
            ) as import('ms').StringValue,
          },
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
