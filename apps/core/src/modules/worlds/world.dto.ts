import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

class SizeDto {
  @ApiProperty() w!: number;
  @ApiProperty() h!: number;
}
class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}
class WorldProfileDto {
  @ApiProperty({ format: 'uuid' }) playerId!: string;
  @ApiPropertyOptional({ type: VectorDto, nullable: true }) homeSettlement!: VectorDto | null;
}

export class WorldDto {
  @ApiProperty({ example: 'world-1' }) slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['DRAFT', 'OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() isTest!: boolean;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiPropertyOptional({ type: WorldProfileDto, nullable: true }) profile!: WorldProfileDto | null;
  @ApiProperty({ example: '2026-09-14T12:00:00.000Z' }) serverTime!: string;
}

export class JoinWorldDto {
  @ApiPropertyOptional({ example: 'Koralowa', minLength: 1, maxLength: 32, description: 'Domyślnie „Osada”' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32)
  name?: string;
}
