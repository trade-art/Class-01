import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Secret source types
 */
export enum SecretSource {
  ENVIRONMENT = 'environment',
  DOCKER_SECRET = 'docker-secret',
  FILE = 'file',
  DEFAULT = 'default',
}

/**
 * Secret metadata
 */
interface SecretMetadata {
  name: string;
  source: SecretSource;
  loaded: boolean;
  redacted: boolean;
}

/**
 * Secrets Service
 *
 * Provides secure management of sensitive configuration values.
 * Supports multiple secret sources with priority:
 * 1. Environment variables (highest priority)
 * 2. Docker secrets (/run/secrets/)
 * 3. File-based secrets
 * 4. Default values (lowest priority)
 *
 * Features:
 * - Automatic secret loading from multiple sources
 * - Never logs secret values
 * - Tracks secret sources for debugging
 * - Validates required secrets on startup
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly secrets = new Map<string, string>();
  private readonly metadata = new Map<string, SecretMetadata>();
  private readonly dockerSecretsPath = '/run/secrets';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.loadSecrets();
    this.validateRequiredSecrets();
    this.logSecretsSummary();
  }

  /**
   * Load secrets from all sources
   */
  private async loadSecrets(): Promise<void> {
    const secretNames = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'DATABASE_URL',
      'REDIS_PASSWORD',
      'MIDDLEWARE_PASSWORD_KEY',
      'SMTP_PASSWORD',
      'SLACK_WEBHOOK_URL',
    ];

    for (const name of secretNames) {
      const { value, source } = await this.resolveSecret(name);
      if (value) {
        this.secrets.set(name, value);
        this.metadata.set(name, {
          name,
          source,
          loaded: true,
          redacted: this.isRedactedSecret(name),
        });
      }
    }
  }

  /**
   * Resolve a secret from available sources
   */
  private async resolveSecret(
    name: string,
  ): Promise<{ value: string | undefined; source: SecretSource }> {
    // 1. Check environment variable
    const envValue = this.configService.get<string>(name);
    if (envValue) {
      return { value: envValue, source: SecretSource.ENVIRONMENT };
    }

    // 2. Check Docker secrets
    const dockerSecretPath = path.join(this.dockerSecretsPath, name);
    if (fs.existsSync(dockerSecretPath)) {
      try {
        const value = fs.readFileSync(dockerSecretPath, 'utf-8').trim();
        if (value) {
          return { value, source: SecretSource.DOCKER_SECRET };
        }
      } catch {
        this.logger.warn(`Failed to read Docker secret: ${name}`);
      }
    }

    // 3. Check file-based secret (e.g., JWT_SECRET_FILE)
    const filePathEnv = this.configService.get<string>(`${name}_FILE`);
    if (filePathEnv && fs.existsSync(filePathEnv)) {
      try {
        const value = fs.readFileSync(filePathEnv, 'utf-8').trim();
        if (value) {
          return { value, source: SecretSource.FILE };
        }
      } catch {
        this.logger.warn(`Failed to read secret file: ${filePathEnv}`);
      }
    }

    return { value: undefined, source: SecretSource.DEFAULT };
  }

  /**
   * Get a secret value
   */
  get(name: string): string | undefined {
    return this.secrets.get(name);
  }

  /**
   * Get a secret value or throw if not found
   */
  getOrThrow(name: string): string {
    const value = this.secrets.get(name);
    if (!value) {
      throw new Error(`Required secret not found: ${name}`);
    }
    return value;
  }

  /**
   * Check if a secret is loaded
   */
  has(name: string): boolean {
    return this.secrets.has(name);
  }

  /**
   * Get the source of a secret
   */
  getSource(name: string): SecretSource | undefined {
    return this.metadata.get(name)?.source;
  }

  /**
   * Validate required secrets are present
   */
  private validateRequiredSecrets(): void {
    const required = ['JWT_SECRET', 'DATABASE_URL'];
    const missing: string[] = [];

    for (const name of required) {
      if (!this.secrets.has(name)) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      const message = `Missing required secrets: ${missing.join(', ')}`;
      this.logger.error(message);

      // In production, fail fast
      if (process.env.NODE_ENV === 'production') {
        throw new Error(message);
      }
    }
  }

  /**
   * Log secrets summary (never log actual values)
   */
  private logSecretsSummary(): void {
    const summary = Array.from(this.metadata.values()).map((m) => ({
      name: m.name,
      source: m.source,
      loaded: m.loaded ? '✓' : '✗',
    }));

    this.logger.log('Secrets loaded:');
    for (const { name, source, loaded } of summary) {
      this.logger.log(`  ${loaded} ${name}: ${source}`);
    }
  }

  /**
   * Check if a secret should be redacted in logs
   */
  private isRedactedSecret(name: string): boolean {
    const redactedPatterns = [
      'SECRET',
      'PASSWORD',
      'KEY',
      'TOKEN',
      'CREDENTIAL',
      'AUTH',
    ];
    return redactedPatterns.some((pattern) =>
      name.toUpperCase().includes(pattern),
    );
  }

  /**
   * Get a redacted version of a secret for logging
   */
  getRedacted(name: string): string {
    const value = this.secrets.get(name);
    if (!value) return '[NOT SET]';
    if (value.length <= 8) return '****';
    return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
  }

  /**
   * Get all secret names (not values)
   */
  getSecretNames(): string[] {
    return Array.from(this.secrets.keys());
  }

  /**
   * Get secrets status for health checks
   */
  getStatus(): { loaded: number; missing: number; sources: Record<string, number> } {
    const sources: Record<string, number> = {};
    let missing = 0;

    for (const meta of this.metadata.values()) {
      if (meta.loaded) {
        sources[meta.source] = (sources[meta.source] || 0) + 1;
      } else {
        missing++;
      }
    }

    return {
      loaded: this.secrets.size,
      missing,
      sources,
    };
  }
}
