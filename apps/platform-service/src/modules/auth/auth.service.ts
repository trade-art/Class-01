import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, LoginResponseDto, UserType } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  userType: UserType;
  tenantId?: string;
  tenantCode?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { email, password, userType, tenantCode } = loginDto;

    if (userType === UserType.PLATFORM_ADMIN) {
      return this.loginPlatformAdmin(email, password);
    } else if (userType === UserType.TENANT_ADMIN) {
      if (!tenantCode) {
        throw new BadRequestException('Tenant code is required for tenant admin login');
      }
      return this.loginTenantAdmin(email, password, tenantCode);
    }

    throw new BadRequestException('Invalid user type');
  }

  private async loginPlatformAdmin(email: string, password: string): Promise<LoginResponseDto> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      userType: UserType.PLATFORM_ADMIN,
    };

    return this.generateTokens(payload);
  }

  private async loginTenantAdmin(
    email: string,
    password: string,
    tenantCode: string,
  ): Promise<LoginResponseDto> {
    // Find tenant by code
    const tenant = await this.prisma.tenant.findUnique({
      where: { code: tenantCode },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid tenant code');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tenant account is not active');
    }

    // Find admin
    const admin = await this.prisma.tenantAdmin.findFirst({
      where: {
        tenantId: tenant.id,
        email,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      userType: UserType.TENANT_ADMIN,
      tenantId: tenant.id,
      tenantCode: tenant.code,
    };

    return this.generateTokens(payload);
  }

  private generateTokens(payload: JwtPayload): LoginResponseDto {
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d',
    });

    const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        userType: payload.userType,
        tenantId: payload.tenantId,
        tenantCode: payload.tenantCode,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<LoginResponseDto> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Verify user still exists and is active
      if (payload.userType === UserType.PLATFORM_ADMIN) {
        const admin = await this.prisma.platformAdmin.findUnique({
          where: { id: payload.sub },
        });
        if (!admin || !admin.isActive) {
          throw new UnauthorizedException('Invalid token');
        }
      } else {
        const admin = await this.prisma.tenantAdmin.findUnique({
          where: { id: payload.sub },
        });
        if (!admin || !admin.isActive) {
          throw new UnauthorizedException('Invalid token');
        }
      }

      const newPayload: JwtPayload = {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        userType: payload.userType,
        tenantId: payload.tenantId,
        tenantCode: payload.tenantCode,
      };

      return this.generateTokens(newPayload);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async validateUser(payload: JwtPayload): Promise<JwtPayload | null> {
    if (payload.userType === UserType.PLATFORM_ADMIN) {
      const admin = await this.prisma.platformAdmin.findUnique({
        where: { id: payload.sub },
      });
      if (admin && admin.isActive) {
        return payload;
      }
    } else {
      const admin = await this.prisma.tenantAdmin.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });
      if (admin && admin.isActive && admin.tenant.status === 'ACTIVE') {
        return payload;
      }
    }
    return null;
  }
}
