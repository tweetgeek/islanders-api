import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class RegisterDto {
  @ApiProperty({ example: 'gracz@example.com' })
  @trim
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'koralowy_kapitan',
    description: '3–20 znaków: litery, cyfry, _ i -',
  })
  @trim
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,20}$/, {
    message: 'pseudonim: 3–20 znaków, litery, cyfry, _ i -',
  })
  nickname!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @ApiProperty()
  @trim
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class AuthResultDto {
  @ApiProperty() playerId!: number;
  @ApiProperty() nickname!: string;
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}

export class ConflictFieldDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'Conflict' }) error!: string;
  @ApiProperty({ example: 'E-mail jest już zajęty' }) message!: string;
  @ApiPropertyOptional({ example: 'email' }) field?: string;
}
