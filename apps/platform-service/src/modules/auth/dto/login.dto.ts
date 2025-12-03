import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';

export enum UserType {
  PLATFORM_ADMIN = 'platform_admin',
  TENANT_ADMIN = 'tenant_admin',
}

export class LoginDto {
  @ApiProperty({ example: 'admin@mt5platform.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: UserType, example: UserType.PLATFORM_ADMIN })
  @IsEnum(UserType)
  @IsNotEmpty()
  userType: UserType;

  @ApiProperty({ required: false, description: 'Required for tenant admin login' })
  @IsString()
  @IsOptional()
  tenantCode?: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    userType: UserType;
    tenantId?: string;
    tenantCode?: string;
  };
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
