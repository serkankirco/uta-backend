import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewCompanyDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ example: 'Vergi levhası geçersiz, lütfen güncel belge yükleyin.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionNote?: string;
}
