import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

// Falla ruidosamente en el arranque si el secreto no está; nunca caer en un
// fallback inseguro (un secreto público dejaría falsificar cualquier JWT).
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está definido en las variables de entorno.');
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: any) {
    // Se cargan las sedes del actor (ADM-1) para acotar el alcance admin/operador.
    // Va contra la BD en cada request (no en el JWT), así la asignación de sedes
    // queda fresca aunque el token dure 7 días.
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['sedes'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido.');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      sedeIds: (user.sedes ?? []).map((s) => s.id),
    };
  }
}
