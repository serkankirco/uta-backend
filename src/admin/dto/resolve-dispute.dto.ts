import { IsEnum, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class ResolveDisputeDto {
  @ApiProperty({ example: 'Alıcı lehine karar verildi. Ürün iade edilecek.' })
  @IsString()
  @MaxLength(2000)
  resolution: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CANCELLED })
  @IsEnum(OrderStatus)
  finalOrderStatus: OrderStatus;
}
