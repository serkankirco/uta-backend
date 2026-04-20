import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ali@firma.com.tr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Güçlü1Şifre!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
