import { Test, TestingModule } from '@nestjs/testing';
import { WebsocketService } from './websocket.service';
import { WsEventType, PositionUpdateData, QuoteUpdateData, RiskAlertData } from './dto';
import { Server, Socket } from 'socket.io';

describe('WebsocketService', () => {
  let service: WebsocketService;

  // Mock Socket
  const createMockSocket = (id: string): Partial<Socket> => ({
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
  });

  // Mock Server
  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  } as unknown as Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebsocketService],
    }).compile();

    service = module.get<WebsocketService>(WebsocketService);
    service.setServer(mockServer);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerClient', () => {
    it('应该成功注册客户端', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');

      expect(mockSocket.join).toHaveBeenCalledWith('tenant:tenant-1');
      expect(service.getClientInfo('socket-1')).toBeDefined();
      expect(service.getTenantClientCount('tenant-1')).toBe(1);
    });

    it('应该将同一租户的多个客户端放入同一房间', () => {
      const mockSocket1 = createMockSocket('socket-1') as Socket;
      const mockSocket2 = createMockSocket('socket-2') as Socket;

      service.registerClient(mockSocket1, 'tenant-1', 'admin-1', 'instance-1');
      service.registerClient(mockSocket2, 'tenant-1', 'admin-2', 'instance-1');

      expect(service.getTenantClientCount('tenant-1')).toBe(2);
      expect(service.getTotalClientCount()).toBe(2);
    });
  });

  describe('unregisterClient', () => {
    it('应该成功注销客户端', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');
      service.unregisterClient('socket-1');

      expect(mockSocket.leave).toHaveBeenCalledWith('tenant:tenant-1');
      expect(service.getClientInfo('socket-1')).toBeUndefined();
      expect(service.getTenantClientCount('tenant-1')).toBe(0);
    });

    it('注销最后一个客户端后应清理租户房间', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');
      expect(service.getTenantClientCount('tenant-1')).toBe(1);

      service.unregisterClient('socket-1');
      expect(service.getTenantClientCount('tenant-1')).toBe(0);
    });
  });

  describe('subscribeSymbols', () => {
    it('应该成功订阅品种', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');
      service.subscribeSymbols('socket-1', ['EURUSD', 'GBPUSD']);

      expect(mockSocket.join).toHaveBeenCalledWith('symbol:EURUSD');
      expect(mockSocket.join).toHaveBeenCalledWith('symbol:GBPUSD');

      const clientInfo = service.getClientInfo('socket-1');
      expect(clientInfo?.subscribedSymbols.has('EURUSD')).toBe(true);
      expect(clientInfo?.subscribedSymbols.has('GBPUSD')).toBe(true);
    });
  });

  describe('unsubscribeSymbols', () => {
    it('应该成功取消订阅品种', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');
      service.subscribeSymbols('socket-1', ['EURUSD', 'GBPUSD']);
      service.unsubscribeSymbols('socket-1', ['EURUSD']);

      expect(mockSocket.leave).toHaveBeenCalledWith('symbol:EURUSD');

      const clientInfo = service.getClientInfo('socket-1');
      expect(clientInfo?.subscribedSymbols.has('EURUSD')).toBe(false);
      expect(clientInfo?.subscribedSymbols.has('GBPUSD')).toBe(true);
    });
  });

  describe('broadcastPositionUpdate', () => {
    it('应该向租户广播持仓更新', () => {
      const positionData: PositionUpdateData = {
        ticket: 12345,
        login: 1001,
        symbol: 'EURUSD',
        type: 'buy',
        volume: 1.0,
        openPrice: 1.085,
        currentPrice: 1.0875,
        profit: 250,
        swap: -2.5,
        commission: -7,
        openTime: '2024-01-15T10:30:00Z',
      };

      service.broadcastPositionUpdate('tenant-1', positionData);

      expect(mockServer.to).toHaveBeenCalledWith('tenant:tenant-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WsEventType.POSITION_UPDATE,
        expect.objectContaining({
          event: WsEventType.POSITION_UPDATE,
          data: positionData,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('broadcastQuoteUpdate', () => {
    it('应该向订阅者广播报价更新', () => {
      const quoteData: QuoteUpdateData = {
        symbol: 'EURUSD',
        bid: 1.0850,
        ask: 1.0852,
        last: 1.0851,
        volume: 1000,
        time: '2024-01-15T10:30:00Z',
        spread: 2,
        change: 0.0005,
        changePercent: 0.05,
      };

      service.broadcastQuoteUpdate(quoteData);

      expect(mockServer.to).toHaveBeenCalledWith('symbol:EURUSD');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WsEventType.QUOTE_UPDATE,
        expect.objectContaining({
          event: WsEventType.QUOTE_UPDATE,
          data: quoteData,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('broadcastRiskAlert', () => {
    it('应该向租户广播风险预警', () => {
      const alertData: RiskAlertData = {
        id: 'alert-1',
        type: 'margin_warning',
        level: 'high',
        message: '保证金水平低于50%',
        data: { marginLevel: 48.5 },
        createdAt: '2024-01-15T10:30:00Z',
      };

      service.broadcastRiskAlert('tenant-1', alertData);

      expect(mockServer.to).toHaveBeenCalledWith('tenant:tenant-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WsEventType.RISK_ALERT,
        expect.objectContaining({
          event: WsEventType.RISK_ALERT,
          data: alertData,
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('sendToClient', () => {
    it('应该向单个客户端发送消息', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');
      service.sendToClient('socket-1', WsEventType.SYSTEM_NOTIFICATION, {
        message: '系统维护通知',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        WsEventType.SYSTEM_NOTIFICATION,
        expect.objectContaining({
          event: WsEventType.SYSTEM_NOTIFICATION,
          data: { message: '系统维护通知' },
          timestamp: expect.any(String),
        }),
      );
    });

    it('客户端不存在时不应抛出错误', () => {
      expect(() => {
        service.sendToClient('non-existent', WsEventType.SYSTEM_NOTIFICATION, {
          message: 'test',
        });
      }).not.toThrow();
    });
  });

  describe('getClientInfo', () => {
    it('应该返回客户端信息', () => {
      const mockSocket = createMockSocket('socket-1') as Socket;

      service.registerClient(mockSocket, 'tenant-1', 'admin-1', 'instance-1');

      const clientInfo = service.getClientInfo('socket-1');

      expect(clientInfo).toBeDefined();
      expect(clientInfo?.tenantId).toBe('tenant-1');
      expect(clientInfo?.adminId).toBe('admin-1');
      expect(clientInfo?.instanceId).toBe('instance-1');
      expect(clientInfo?.connectedAt).toBeInstanceOf(Date);
    });

    it('客户端不存在时应返回 undefined', () => {
      const clientInfo = service.getClientInfo('non-existent');
      expect(clientInfo).toBeUndefined();
    });
  });
});
