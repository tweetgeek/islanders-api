import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SizeDto {
  @ApiProperty() w!: number;
  @ApiProperty() h!: number;
}
class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}

export class WorldListItemDto {
  @ApiProperty({ example: '1' }) id!: string;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() joined!: boolean;
}

export class WorldStateDto {
  @ApiProperty({ example: '1' }) id!: string;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() playerId!: number;
  @ApiPropertyOptional({ type: VectorDto, nullable: true })
  homeSettlement!: VectorDto | null;
  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' }) serverTime!: string;
}
