import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

import { User } from '../users/entities/user.entity';
import { ResendVerificationDto } from './dto/resend-verification.dto';
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

  // Registro de nuevo usuario.
  // Anti-enumeración (#12): si el correo o el DPI ya existen NO creamos la cuenta,
  // pero respondemos EXACTAMENTE igual que en un registro exitoso para no revelar
  // qué cuentas existen.
  async register(dto: RegisterDto) {
    const neutralResponse = {
      message: 'Registro exitoso. Revisa tu correo para verificar tu cuenta.',
    };

    // Buscar duplicados por correo y, si vino, por DPI (ambos son únicos).
    const orConditions: FindOptionsWhere<User>[] = [{ email: dto.email }];
    if (dto.dpi) {
      orConditions.push({ dpi: dto.dpi });
    }
    const existing = await this.userRepository.findOne({ where: orConditions });

    if (existing) {
      // Igualar el tiempo de respuesta con el camino "usuario nuevo" (que sí
      // ejecuta bcrypt.hash). Sin esto, la diferencia de latencia revela si el
      // correo/DPI ya existe, anulando la respuesta neutra anti-enumeración.
      await bcrypt.hash(dto.password, 12);
      return neutralResponse;
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

    try {
      await this.userRepository.save(user);
    } catch (e) {
      // Carrera: dos registros simultáneos del mismo correo/DPI. La unique
      // constraint de la BD lo corta (23505); mantenemos la respuesta neutra.
      if ((e as { code?: string } | null)?.code === '23505') {
        return neutralResponse;
      }
      throw e;
    }

    try {
      await this.createAndSendOtp(user, OtpPurpose.REGISTER);
    } catch (e) {
      await this.otpRepository.delete({ userId: user.id });
      await this.userRepository.delete(user.id);
      throw e;
    }

    return neutralResponse;
  }

  // Reenviar el OTP de verificacion si la cuenta existe y aun no esta verificada.
  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (user && !user.isEmailVerified) {
      await this.createAndSendOtp(user, OtpPurpose.REGISTER);
    }

    return {
      message:
        'Si tu cuenta esta pendiente de verificación, recibirás un código nuevo.',
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

    // Generar código de 6 dígitos. Usamos el rango completo [0, 1000000) y
    // rellenamos con ceros a la izquierda: así "001234" también es válido y el
    // espacio de búsqueda es el millón completo (no 900k).
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');

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
