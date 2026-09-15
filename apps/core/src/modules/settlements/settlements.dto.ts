import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ResourcesDto {
  @ApiProperty() wood!: number;
  @ApiProperty() stone!: number;
  @ApiProperty() food!: number;
  @ApiProperty() iron!: number;
  @ApiProperty() sulfur!: number;
}

/** Cudza osada ma tylko pola publiczne; własna dodatkowo pola od `resources` w dół. Brak `resources` = osada cudza. */
export class SettlementDto {
  @ApiProperty({ example: 'world-1' }) world!: string;
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: ResourcesDto }) resources?: ResourcesDto;
  @ApiPropertyOptional({ type: ResourcesDto }) productionPerHour?: ResourcesDto;
  @ApiPropertyOptional() capacity?: number;
  @ApiPropertyOptional() population?: number;
  @ApiPropertyOptional() populationMax?: number;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  buildings?: Record<string, number>;
  @ApiPropertyOptional({ example: '2026-09-08T12:00:00.000Z' })
  lastSyncAt?: string;
}
