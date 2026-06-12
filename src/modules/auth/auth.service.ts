import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { User } from '../users/entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OtpPurpose } from '../../common/enums/otp-purpose.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MAX_OTP_ATTEMPTS = 5;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,

    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Registro de nuevo usuario
  async register(dto: RegisterDto) {
    // Verificar que el correo no esté registrado ya
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Este correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      dpi: dto.dpi,
      phone: dto.phone,
      password: hashedPassword,
      isEmailVerified: false,
    });

    await this.userRepository.save(user);

    // Después del registro enviamos el OTP para verificar el correo
    await this.createAndSendOtp(user, OtpPurpose.REGISTER);

    return {
      message: 'Registro exitoso. Revisa tu correo para verificar tu cuenta.',
    };
  }

  // El usuario ingresa el OTP que recibió (2do factor del login)
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.validateOtp(user.id, dto.code, OtpPurpose.LOGIN);

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

  // Helper: valida el OTP activo del usuario para un propósito, con lockout.
  // Busca por (usuario, propósito) — NO por código — para poder contar intentos
  // fallidos sobre el mismo OTP y quemarlo tras MAX_OTP_ATTEMPTS (anti fuerza bruta).
  private async validateOtp(userId: string, code: string, purpose: OtpPurpose) {
    const otp = await this.otpRepository.findOne({
      where: { userId, purpose, used: false },
      order: { createdAt: 'DESC' },
    });
    if (!otp) {
      throw new UnauthorizedException('Código inválido o ya utilizado.');
    }
    if (new Date() > otp.expiresAt) {
      throw new UnauthorizedException(
        'El código ha expirado. Solicita uno nuevo.',
      );
    }
    if (otp.attempts >= this.MAX_OTP_ATTEMPTS) {
      otp.used = true; // quemamos el OTP: hay que pedir uno nuevo
      await this.otpRepository.save(otp);
      throw new UnauthorizedException(
        'Demasiados intentos fallidos. Solicita un código nuevo.',
      );
    }
    if (otp.code !== code) {
      otp.attempts += 1;
      await this.otpRepository.save(otp);
      throw new UnauthorizedException('Código inválido.');
    }
    otp.used = true;
    await this.otpRepository.save(otp);
    return otp;
  }

  // Verifica el correo tras el registro y deja entrar al usuario (1ra sesión)
  async verifyEmail(dto: VerifyOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.validateOtp(user.id, dto.code, OtpPurpose.REGISTER);

    user.isEmailVerified = true;
    await this.userRepository.save(user);

    const payload = { sub: user.id, email: user.email, role: user.role };
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

  // 1er factor: email + contraseña. Si son válidos, envía el OTP de login.
  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      select: [
        'id',
        'email',
        'password',
        'role',
        'fullName',
        'isActive',
        'isEmailVerified',
      ],
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesión.',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Esta cuenta está desactivada.');
    }

    await this.createAndSendOtp(user, OtpPurpose.LOGIN);
    return {
      message: 'Te enviamos un código para completar el inicio de sesión.',
    };
  }

  // Solicita el reset: siempre responde neutro (no revela si el correo existe)
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (user) {
      await this.createAndSendOtp(user, OtpPurpose.PASSWORD_RESET);
    }
    return {
      message:
        'Si el correo está registrado, recibirás un código para restablecer tu contraseña.',
    };
  }

  // Confirma el OTP de reset y guarda la nueva contraseña hasheada
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.validateOtp(user.id, dto.code, OtpPurpose.PASSWORD_RESET);

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);

    return {
      message:
        'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
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

    // En desarrollo logueamos el OTP para poder probar sin depender del correo
    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV] OTP para ${user.email} (${purpose}): ${code}`);
    }

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
