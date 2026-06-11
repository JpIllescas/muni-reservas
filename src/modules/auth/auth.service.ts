import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as otplib from 'otplib';
import * as crypto from 'crypto'

import { User } from '../users/entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpPurpose } from '../../common/enums/otp-purpose.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,

    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) { }

  // Registro de nuevo usuario
  async register(dto: RegisterDto) {
    // Verificar que el correo no esté registrado ya
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Este correo ya está registrado');
    }

    const user = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      dpi: dto.dpi,
      phone: dto.phone,
    });

    await this.userRepository.save(user);

    // Después del registro enviamos el OTP para verificar el correo
    await this.createAndSendOtp(user, OtpPurpose.REGISTER);

    return {
      message: 'Registro exitoso. Revisa tu correo para verificar tu cuenta.',
    };
  }

  // El usuario pide un OTP para iniciar sesión
  async requestOtp(dto: RequestOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // No revelamos si el correo existe o no por seguridad
      return {
        message: 'Si el correo está registrado, recibirás un código.',
      };
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Esta cuenta está desactivada.');
    }

    await this.createAndSendOtp(user, OtpPurpose.LOGIN);

    return {
      message: 'Si el correo está registrado, recibirás un código.',
    };
  }

  // El usuario ingresa el OTP que recibió
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Buscar el OTP más reciente no usado y no expirado
    const otp = await this.otpRepository.findOne({
      where: {
        userId: user.id,
        code: dto.code,
        used: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new UnauthorizedException('Código inválido.');
    }

    // Verificar que no haya expirado
    if (new Date() > otp.expiresAt) {
      throw new UnauthorizedException(
        'El código ha expirado. Solicita uno nuevo.',
      );
    }

    // Marcar el OTP como usado para que no se pueda reutilizar
    otp.used = true;
    await this.otpRepository.save(otp);

    // Generar el JWT que usará el frontend en cada request
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  // Método privado que crea el OTP y lo guarda en la base de datos
  private async createAndSendOtp(user: User, purpose: OtpPurpose) {
    // Invalidar OTPs anteriores del mismo usuario y propósito
    await this.otpRepository.update(
      { userId: user.id, purpose, used: false },
      { used: true },
    );

    // Generar código de 6 dígitos
    const code = crypto.randomInt(100000, 1000000).toString();

    // El OTP expira en 10 minutos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const otp = this.otpRepository.create({
      userId: user.id,
      code,
      purpose,
      expiresAt,
    });

    await this.otpRepository.save(otp);

    await this.notificationsService.sendOtpEmail(
      user.email,
      user.fullName,
      code,
    );
    return otp;
  }
}
