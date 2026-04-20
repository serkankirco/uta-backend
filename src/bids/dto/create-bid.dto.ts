import {
  IsNumber, IsInt, IsOptional, IsString, IsDateString, IsPositive, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBidDto {
  @ApiProperty({ example: 4500 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  unitPrice: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 14, description: 'Teslimat süresi (gün)' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  deliveryDays: number;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional({ example: 'EN 10025 sertifikalı malzeme kullanılmaktadır.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CounterOfferDto extends CreateBidDto {}
