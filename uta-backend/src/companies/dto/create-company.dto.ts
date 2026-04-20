import {
  IsString, IsOptional, IsInt, IsUrl, MinLength, MaxLength, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'ABC Çelik San. Tic. A.Ş.' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @MinLength(10)
  @MaxLength(11)
  taxNumber: string;

  @ApiPropertyOptional({ example: 'Gebze Vergi Dairesi' })
  @IsOptional()
  @IsString()
  taxOffice?: string;

  @ApiProperty({ example: 'Metal ve Çelik' })
  @IsString()
  sector: string;

  @ApiProperty({ example: 'Kocaeli' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'OSB Mah. Sanayi Cad. No:12' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'https://abccelik.com.tr' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;

  @ApiPropertyOptional({ example: 2005 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  foundedYear?: number;
}

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}
