import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación global — activa los decoradores de class-validator en todos los DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina campos que no están en el DTO
      forbidNonWhitelisted: true, // Lanza error si llegan campos no permitidos
      transform: true, // Convierte los tipos automáticamente
    }),
  );

  // Prefijo global para todas las rutas — todas empiezan con /api
  app.setGlobalPrefix('api');

  await app.listen(3000);
  console.log('Servidor corriendo en http://localhost:3000/api');
}
bootstrap();
