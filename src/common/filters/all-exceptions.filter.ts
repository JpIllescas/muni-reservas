import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    // Interceptar errores únicos de base de datos (PostgreSQL 23505)
    // Esto evita que mostremos columnas internas al usuario si el correo o DPI ya existen.
    if (exception?.code === '23505') {
      status = HttpStatus.CONFLICT;
      message = {
        message:
          'El registro ya existe. Verifica que no estés usando un correo o DPI duplicado.',
        error: 'Conflict',
      };
    }

    // Archivo más grande que el limite de Multer
    if (exception?.code === 'LIMIT_FILE_SIZE') {
      status = HttpStatus.PAYLOAD_TOO_LARGE; // 413
      message = {
        message: `El archivo excede el tamaño máximo permitido (${process.env.MAX_FILE_SIZE_MB || 5}MB).`,
        error: 'Payload Too Large',
      };
    }

    // Exclusion violation (23P01): el backstop de la BD rechazó un solapamiento
    if (exception?.code === '23P01') {
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
          : (message as any).message || message,
    });
  }
}
