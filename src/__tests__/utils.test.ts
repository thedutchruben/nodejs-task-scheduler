import { RabbitMQConnection } from '../utils/rabbitmq';

// Mock amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn()
}));

describe('RabbitMQConnection', () => {
  let connection: RabbitMQConnection;
  const mockConnect = require('amqplib').connect;

  beforeEach(() => {
    connection = new RabbitMQConnection({
      url: 'amqp://test:test@localhost:5672',
      options: {}
    });
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should create RabbitMQConnection instance', () => {
      expect(connection).toBeInstanceOf(RabbitMQConnection);
    });

    it('should initially be disconnected', () => {
      expect(connection.isConnected()).toBe(false);
    });

    it('should throw error when getting channel before connection', () => {
      expect(() => connection.getChannel()).toThrow('Not connected to RabbitMQ');
    });

    it('should handle successful connection', async () => {
      const mockChannel = {
        assertQueue: jest.fn(),
        consume: jest.fn(),
        sendToQueue: jest.fn(),
        close: jest.fn(),
        prefetch: jest.fn()
      };

      const mockConnection = {
        createChannel: jest.fn().mockResolvedValue(mockChannel),
        on: jest.fn(),
        close: jest.fn()
      };

      mockConnect.mockResolvedValue(mockConnection);

      await connection.connect();

      expect(mockConnect).toHaveBeenCalledWith(
        'amqp://test:test@localhost:5672',
        {}
      );
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(connection.isConnected()).toBe(true);
    });

    it('should handle connection errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      // Don't wait for the full reconnection process
      const connectPromise = connection.connect();
      
      // Wait a short time for the initial connection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to connect to RabbitMQ:', expect.any(Error));
      
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should handle disconnect gracefully', async () => {
      const mockChannel = {
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockConnection = {
        close: jest.fn().mockResolvedValue(undefined)
      };

      // Manually set the connection and channel for testing
      (connection as any).connection = mockConnection;
      (connection as any).channel = mockChannel;

      await connection.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(connection.isConnected()).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const mockChannel = {
        close: jest.fn().mockRejectedValue(new Error('Channel close failed'))
      };

      const mockConnection = {
        close: jest.fn().mockRejectedValue(new Error('Connection close failed'))
      };

      // Manually set the connection and channel for testing
      (connection as any).connection = mockConnection;
      (connection as any).channel = mockChannel;

      await connection.disconnect();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Error closing channel:', expect.any(Error));
      expect(consoleWarnSpy).toHaveBeenCalledWith('Error closing connection:', expect.any(Error));
      expect(connection.isConnected()).toBe(false);
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection on connection error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // First call fails, subsequent calls succeed
      mockConnect
        .mockRejectedValueOnce(new Error('Initial connection failed'))
        .mockResolvedValue({
          createChannel: jest.fn().mockResolvedValue({}),
          on: jest.fn(),
          close: jest.fn()
        });

      // Start connection attempt but don't wait for full completion
      connection.connect();
      
      // Wait a bit for the initial failure and reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should stop reconnection after max attempts', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Create connection with lower max attempts for faster testing
      const testConnection = new RabbitMQConnection({
        url: 'amqp://localhost:5672',
        options: {}
      });

      // Set max attempts to 1 for faster testing
      (testConnection as any).maxReconnectAttempts = 1;
      (testConnection as any).reconnectDelay = 10; // Very short delay

      mockConnect.mockRejectedValue(new Error('Connection always fails'));

      await testConnection.connect();

      // Wait for reconnection attempts to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalledWith('Max reconnection attempts reached');
      
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});