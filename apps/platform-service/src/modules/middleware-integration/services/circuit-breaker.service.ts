import { Injectable, Logger } from '@nestjs/common';
import { CIRCUIT_BREAKER_CONFIG } from '../constants/middleware.constants';

/**
 * 熔断器状态枚举
 */
export enum CircuitState {
  /** 关闭状态 - 正常运行 */
  CLOSED = 'CLOSED',
  /** 打开状态 - 熔断中，拒绝请求 */
  OPEN = 'OPEN',
  /** 半开状态 - 尝试恢复 */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * 熔断器统计信息
 */
export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
}

/**
 * 熔断器服务
 * 实现熔断器模式，防止对故障服务的持续请求
 * middleware-integration Task 6
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<string, CircuitStats>();

  private readonly config = {
    failureThreshold: CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD,
    successThreshold: CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD,
    openTimeout: CIRCUIT_BREAKER_CONFIG.OPEN_TIMEOUT_MS,
  };

  /**
   * 检查熔断器是否打开 (是否应该拒绝请求)
   */
  isOpen(instanceId: string): boolean {
    const circuit = this.getCircuit(instanceId);

    if (circuit.state === CircuitState.OPEN) {
      // 检查是否应该进入半开状态
      const elapsed = Date.now() - circuit.lastStateChange.getTime();
      if (elapsed >= this.config.openTimeout) {
        this.setState(instanceId, CircuitState.HALF_OPEN);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * 检查熔断器是否允许请求
   */
  canRequest(instanceId: string): boolean {
    return !this.isOpen(instanceId);
  }

  /**
   * 记录成功
   */
  recordSuccess(instanceId: string): void {
    const circuit = this.getCircuit(instanceId);
    circuit.lastSuccess = new Date();
    circuit.totalRequests++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.successes++;
      this.logger.debug(
        `Circuit ${instanceId} HALF_OPEN success: ${circuit.successes}/${this.config.successThreshold}`,
      );

      if (circuit.successes >= this.config.successThreshold) {
        this.setState(instanceId, CircuitState.CLOSED);
        circuit.failures = 0;
        circuit.successes = 0;
        this.logger.log(`Circuit breaker for ${instanceId}: HALF_OPEN -> CLOSED (recovered)`);
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // 成功时重置失败计数
      circuit.failures = 0;
    }
  }

  /**
   * 记录失败
   */
  recordFailure(instanceId: string, error?: string): void {
    const circuit = this.getCircuit(instanceId);
    circuit.failures++;
    circuit.totalFailures++;
    circuit.totalRequests++;
    circuit.lastFailure = new Date();

    if (circuit.state === CircuitState.HALF_OPEN) {
      // 半开状态下失败，重新打开
      this.setState(instanceId, CircuitState.OPEN);
      circuit.successes = 0;
      this.logger.warn(
        `Circuit breaker for ${instanceId}: HALF_OPEN -> OPEN (failed during recovery)`,
      );
    } else if (circuit.state === CircuitState.CLOSED) {
      if (circuit.failures >= this.config.failureThreshold) {
        this.setState(instanceId, CircuitState.OPEN);
        this.logger.warn(
          `Circuit breaker OPENED for instance ${instanceId} after ${circuit.failures} failures. Error: ${error || 'unknown'}`,
        );
      }
    }
  }

  /**
   * 获取熔断器状态
   */
  getState(instanceId: string): CircuitStats {
    return { ...this.getCircuit(instanceId) };
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStates(): Map<string, CircuitStats> {
    const result = new Map<string, CircuitStats>();
    this.circuits.forEach((stats, id) => {
      result.set(id, { ...stats });
    });
    return result;
  }

  /**
   * 获取打开的熔断器列表
   */
  getOpenCircuits(): string[] {
    const openCircuits: string[] = [];
    this.circuits.forEach((stats, id) => {
      if (stats.state === CircuitState.OPEN) {
        openCircuits.push(id);
      }
    });
    return openCircuits;
  }

  /**
   * 手动重置熔断器
   */
  reset(instanceId: string): void {
    this.circuits.delete(instanceId);
    this.logger.log(`Circuit breaker for ${instanceId} manually reset`);
  }

  /**
   * 手动打开熔断器
   */
  forceOpen(instanceId: string): void {
    const circuit = this.getCircuit(instanceId);
    this.setState(instanceId, CircuitState.OPEN);
    this.logger.warn(`Circuit breaker for ${instanceId} manually opened`);
  }

  /**
   * 获取熔断器统计摘要
   */
  getSummary(): {
    total: number;
    closed: number;
    open: number;
    halfOpen: number;
  } {
    let closed = 0, open = 0, halfOpen = 0;

    this.circuits.forEach((stats) => {
      switch (stats.state) {
        case CircuitState.CLOSED:
          closed++;
          break;
        case CircuitState.OPEN:
          open++;
          break;
        case CircuitState.HALF_OPEN:
          halfOpen++;
          break;
      }
    });

    return {
      total: this.circuits.size,
      closed,
      open,
      halfOpen,
    };
  }

  /**
   * 获取或创建熔断器
   */
  private getCircuit(instanceId: string): CircuitStats {
    if (!this.circuits.has(instanceId)) {
      this.circuits.set(instanceId, {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null,
        lastStateChange: new Date(),
        totalRequests: 0,
        totalFailures: 0,
      });
    }
    return this.circuits.get(instanceId)!;
  }

  /**
   * 设置熔断器状态
   */
  private setState(instanceId: string, state: CircuitState): void {
    const circuit = this.getCircuit(instanceId);
    const previousState = circuit.state;
    circuit.state = state;
    circuit.lastStateChange = new Date();

    this.logger.log(
      `Circuit breaker for ${instanceId}: ${previousState} -> ${state}`,
    );
  }
}
