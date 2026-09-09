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

export class JoinWorldDto {
  @ApiPropertyOptional({
    example: 'Koralowa',
    minLength: 1,
    maxLength: 32,
    description: 'Domyślnie „Osada”',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 32)
  name?: string;
}
