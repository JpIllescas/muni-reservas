import { Module, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),

    MulterModule.registerAsync({
      useFactory: () => {
        const dpiDir = join(process.env.UPLOAD_PATH || './uploads', 'dpi');
        mkdirSync(dpiDir, { recursive: true });

        const maxSizeBytes =
          parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10) * 1024 * 1024;

        return {
          storage: diskStorage({
            destination: dpiDir,
            filename: (req, file, cb) => {
              const uniqueSuffix =
                Date.now() + '-' + Math.round(Math.random() * 1e9);
              cb(null, `dpi-${uniqueSuffix}${extname(file.originalname)}`);
            },
          }),
          fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
              return cb(
                new BadRequestException(
                  'Las fotos del DPI deben ser imágenes JPG o PNG.',
                ),
                false,
              );
            }
            cb(null, true);
          },
          limits: {
            fileSize: maxSizeBytes,
            files: 2, // frente y reverso
          },
        };
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
