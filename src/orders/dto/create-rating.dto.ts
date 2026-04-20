import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRatingDto {
  @ApiProperty({ example: 5, description: '1-5 arası puan' })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  score: number;

  @ApiPropertyOptional({ example: 'Zamanında teslimat, kaliteli ürün. Tekrar çalışırız.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
