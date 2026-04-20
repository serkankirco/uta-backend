import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenDisputeDto {
  @ApiProperty({ example: 'Ürün kalitesi uygun değil' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @ApiProperty({ example: 'Teslim edilen ürünler sipariş edilen özelliklere uymamaktadır...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  description: string;
}
