import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignUserDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
