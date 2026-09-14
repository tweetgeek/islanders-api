import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}

/** Cudza nadchodząca flota nie ma `ships` ani `cargo`. */
export class FleetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '1' }) world!: string;
  @ApiProperty() ownerId!: number;
  @ApiProperty() ownerName!: string;
  @ApiProperty({
    enum: ['COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN'],
  })
  mission!: string;
  @ApiProperty({ type: VectorDto }) from!: VectorDto;
  @ApiProperty({ type: VectorDto }) to!: VectorDto;
  @ApiProperty() departAt!: string;
  @ApiProperty() arriveAt!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  ships?: Record<string, number>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  cargo?: object;
}
