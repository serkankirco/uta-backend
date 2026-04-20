import {
  IsString, IsOptional, IsNumber, IsArray, IsEnum, IsDateString,
  MinLength, MaxLength, Min, IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PostVisibility } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePostDto {
  @ApiProperty({ example: 'S235 HEA 200 Profil Çelik - 50 Ton' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Proje için S235 kalite HEA 200 profil çeliğe ihtiyacımız var...' })
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  description: string;

  @ApiProperty({ example: 'Metal ve Çelik' })
  @IsString()
  sector: string;

  @ApiProperty({ example: 'Profil Çelik' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 'ton' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  budgetMin?: number;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  budgetMax?: number;

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Kocaeli' })
  @IsOptional()
  @IsString()
  deliveryCity?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ enum: PostVisibility, default: PostVisibility.PUBLIC })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @ApiPropertyOptional({ example: ['çelik', 'profil', 'S235'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdatePostDto extends PartialType(CreatePostDto) {}
