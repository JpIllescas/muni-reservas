import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  // No validamos formato/complejidad aquí: solo que venga. La validez real
  // se decide comparando el hash. (Validar complejidad daría pistas a un atacante.)
  @IsNotEmpty()
  @IsString()
  password: string;
}
