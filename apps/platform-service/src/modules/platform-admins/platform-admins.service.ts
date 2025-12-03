import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import {
  CreatePlatformAdminDto,
  UpdatePlatformAdminDto,
  ChangePasswordDto,
  ResetPasswordDto,
} from './dto/platform-admin.dto';
import { PlatformAdmin } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(createDto: CreatePlatformAdminDto): Promise<Omit<PlatformAdmin, 'password'>> {
    // Check if email already exists
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { email: createDto.email },
    });

    if (existing) {
      throw new ConflictException(`Admin with email '${createDto.email}' already exists`);
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(createDto.password);

    const admin = await this.prisma.platformAdmin.create({
      data: {
        email: createDto.email,
        password: hashedPassword,
        name: createDto.name,
        role: createDto.role || 'ADMIN',
      },
    });

    const { password, ...result } = admin;
    return result;
  }

  async findAll(): Promise<Omit<PlatformAdmin, 'password'>[]> {
    const admins = await this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return admins.map(({ password, ...admin }) => admin);
  }

  async findOne(id: string): Promise<Omit<PlatformAdmin, 'password'>> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID '${id}' not found`);
    }

    const { password, ...result } = admin;
    return result;
  }

  async update(
    id: string,
    updateDto: UpdatePlatformAdminDto,
    currentUserId: string,
  ): Promise<Omit<PlatformAdmin, 'password'>> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID '${id}' not found`);
    }

    // Check if trying to change email to one that already exists
    if (updateDto.email && updateDto.email !== admin.email) {
      const existing = await this.prisma.platformAdmin.findUnique({
        where: { email: updateDto.email },
      });

      if (existing) {
        throw new ConflictException(`Admin with email '${updateDto.email}' already exists`);
      }
    }

    // Prevent self-deactivation for super admin
    if (id === currentUserId && updateDto.isActive === false) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const updated = await this.prisma.platformAdmin.update({
      where: { id },
      data: updateDto,
    });

    const { password, ...result } = updated;
    return result;
  }

  async remove(id: string, currentUserId: string): Promise<void> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID '${id}' not found`);
    }

    // Prevent self-deletion
    if (id === currentUserId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    // Prevent deletion of last super admin
    if (admin.role === 'SUPER_ADMIN') {
      const superAdminCount = await this.prisma.platformAdmin.count({
        where: { role: 'SUPER_ADMIN' },
      });

      if (superAdminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last super admin');
      }
    }

    await this.prisma.platformAdmin.delete({
      where: { id },
    });
  }

  async changePassword(
    id: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID '${id}' not found`);
    }

    // Verify current password
    const isValid = await bcrypt.compare(changePasswordDto.currentPassword, admin.password);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await this.authService.hashPassword(changePasswordDto.newPassword);

    await this.prisma.platformAdmin.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async resetPassword(
    id: string,
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID '${id}' not found`);
    }

    // Hash new password
    const hashedPassword = await this.authService.hashPassword(resetPasswordDto.newPassword);

    await this.prisma.platformAdmin.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset successfully' };
  }
}
