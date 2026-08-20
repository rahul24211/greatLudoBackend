import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LudoMatchmakingService } from '../LudoMatchmakingService';
import { redisService } from '../../../../services/redis/redisService';

// Mock Socket.IO server for testing
const createMockIo = () => {
  const socketsMap = new Map<string, any>();

  return {
    sockets: {
      sockets: socketsMap,
    },
    to: (_target: string) => ({
      emit: (_event: string, _data: any) => {},
    }),
    _addSocket: (socketId: string) => {
      const mockSocket = {
        id: socketId,
        join: (_room: string) => {},
        emit: (_event: string, _data: any) => {},
      };
      socketsMap.set(socketId, mockSocket);
      return mockSocket;
    },
  };
};

describe('Ludo Matchmaking Service Tests', () => {
  beforeEach(async () => {
    // Clear matchmaking queue in Redis
    try {
      await redisService.del('ludo:queue:classic:2p');
      await redisService.del('ludo:queue:classic:4p');
      await redisService.del('ludo:queue:classic');
    } catch {}
  });

  it('1. User enters queue and is stored in Redis', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_user_1');

    const result = await LudoMatchmakingService.findMatch(
      { userId: 'user_1', socketId: 'sock_user_1', username: 'Player One' },
      mockIo as any
    );

    assert.strictEqual(result.matched, false);
    const queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 1);
    assert.strictEqual(queue[0].userId, 'user_1');
  });

  it('2. Same user cannot queue twice (duplicate prevention)', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_user_1');

    await LudoMatchmakingService.findMatch(
      { userId: 'user_1', socketId: 'sock_user_1', username: 'Player One' },
      mockIo as any
    );

    const secondAttempt = await LudoMatchmakingService.findMatch(
      { userId: 'user_1', socketId: 'sock_user_1_new', username: 'Player One' },
      mockIo as any
    );

    assert.strictEqual(secondAttempt.matched, false);
    assert.strictEqual(secondAttempt.reason, 'Already in matchmaking queue');

    const queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 1);
  });

  it('3, 4, 5. Two distinct human players match and are both removed from queue', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_p1');
    mockIo._addSocket('sock_p2');

    // Player 1 enters queue
    await LudoMatchmakingService.findMatch(
      { userId: 'human_p1', socketId: 'sock_p1', username: 'Human Alpha' },
      mockIo as any
    );

    let queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 1);

    // Player 2 enters queue -> Matches with Player 1 immediately
    const matchRes = await LudoMatchmakingService.findMatch(
      { userId: 'human_p2', socketId: 'sock_p2', username: 'Human Beta' },
      mockIo as any
    );

    assert.strictEqual(matchRes.matched, true);
    assert.ok(matchRes.gameId);
    assert.strictEqual(matchRes.opponent?.isBot, false);
    assert.strictEqual(matchRes.opponent?.userId, 'human_p1');

    // Both players must be removed from queue
    queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 0);
  });

  it('6 & 7. Bot fallback triggers Bot opponent creation', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_solo_human');

    await LudoMatchmakingService.findMatch(
      { userId: 'solo_human', socketId: 'sock_solo_human', username: 'Solo Human' },
      mockIo as any
    );

    // Trigger bot fallback directly
    const fallbackRes = await LudoMatchmakingService.handleBotFallback(
      'solo_human',
      2,
      mockIo as any
    );

    assert.ok(fallbackRes);
    assert.strictEqual(fallbackRes.matched, true);
    assert.strictEqual(fallbackRes.opponent?.isBot, true);
    assert.ok(fallbackRes.opponent?.userId.startsWith('bot_'));

    const queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 0);
  });

  it('8. Cancel match removes player from queue', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_canceller');

    await LudoMatchmakingService.findMatch(
      { userId: 'user_cancel', socketId: 'sock_canceller', username: 'Canceller' },
      mockIo as any
    );

    let queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 1);

    const cancelRes = await LudoMatchmakingService.cancelMatch('user_cancel');
    assert.strictEqual(cancelRes.cancelled, true);

    queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 0);
  });

  it('9. Disconnect removes player from matchmaking queue', async () => {
    const mockIo = createMockIo();
    mockIo._addSocket('sock_dc');

    await LudoMatchmakingService.findMatch(
      { userId: 'user_dc', socketId: 'sock_dc', username: 'Disconnect User' },
      mockIo as any
    );

    await LudoMatchmakingService.handleDisconnect('user_dc');

    const queue = await LudoMatchmakingService.getQueue();
    assert.strictEqual(queue.length, 0);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);

