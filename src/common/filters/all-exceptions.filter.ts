import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | object =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    // Código de error del driver de Postgres o de Multer, si el error lo trae.
    const code = (exception as { code?: string } | null)?.code;

    // Interceptar errores únicos de base de datos (PostgreSQL 23505). Esto evita que mostremos columnas internas al usuario si el correo o DPI ya existen.
    if (code === '23505') {
      status = HttpStatus.CONFLICT;
      message = {
        message:
          'El registro ya existe. Verifica que no estés usando un correo o DPI duplicado.',
        error: 'Conflict',
      };
    }

    // Archivo más grande que el limite de Multer
    if (code === 'LIMIT_FILE_SIZE') {
      status = HttpStatus.PAYLOAD_TOO_LARGE; // 413
      message = {
        message: `El archivo excede el tamaño máximo permitido (${process.env.MAX_FILE_SIZE_MB || 5}MB).`,
        error: 'Payload Too Large',
      };
    }

    // Exclusion violation (23P01): el backstop de la BD rechazó un solapamiento.
    if (code === '23P01') {
      status = HttpStatus.CONFLICT;
      message = {
        message: 'Ese horario acaba de ser ocupado. por favor elige otro',
        error: 'Conflict',
      };
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'string'
          ? message
          : ((message as { message?: string }).message ?? message),
    });
  }
}
