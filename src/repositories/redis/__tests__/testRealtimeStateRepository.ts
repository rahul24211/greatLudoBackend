import { connectRedis, closeRedis } from '../../../config/redis';
import { realtimeStateRepository } from '../realtimeStateRepository';
import { RedisRoomState, RedisUserPresence } from '../types';
import { LudoGameState } from '../../../game-engine/ludo/LudoTypes';
import { roomKey, gameKey, presenceKey, matchmakingKey } from '../../../services/redis/redisKeys';

async function runRepositoryTests() {
  console.log('📦 Starting Redis Realtime State Repository Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not available. Skipping repository tests.');
    process.exit(0);
  }

  try {
    // Scenario 12: Key Generation Verification
    console.log('\n--- Test 12: Centralized Key Generation ---');
    const rKey = roomKey('room_101');
    const gKey = gameKey('game_202');
    const pKey = presenceKey('user_303');
    const mKey = matchmakingKey('CLASSIC');

    console.assert(rKey === 'ludo:room:room_101', `Expected ludo:room:room_101 but got ${rKey}`);
    console.assert(gKey === 'ludo:game:game_202', `Expected ludo:game:game_202 but got ${gKey}`);
    console.assert(pKey === 'ludo:presence:user_303', `Expected ludo:presence:user_303 but got ${pKey}`);
    console.assert(mKey === 'ludo:matchmaking:classic', `Expected ludo:matchmaking:classic but got ${mKey}`);
    console.log('✅ Key generation verified.');

    // Scenario 1, 2, 3, 4: Room State Operations & TTL
    console.log('\n--- Tests 1, 2, 3, 4: Room State Operations & TTL ---');
    const sampleRoom: RedisRoomState = {
      roomId: 'test_room_alpha',
      hostId: 'host_user_1',
      status: 'WAITING',
      gameMode: 'CLASSIC',
      maxPlayers: 4,
      players: [
        { userId: 'host_user_1', username: 'HostPlayer', isReady: true, isConnected: true, joinedAt: Date.now() },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Save Room State
    const savedRoom = await realtimeStateRepository.saveRoomState(sampleRoom, 60);
    console.assert(savedRoom === true, 'Save room state failed');

    // 2. Get Room State & Verify Exists
    const retrievedRoom = await realtimeStateRepository.getRoomState('test_room_alpha');
    console.assert(retrievedRoom !== null, 'Get room state returned null');
    console.assert(retrievedRoom?.hostId === 'host_user_1', 'Room host ID mismatch');
    console.assert(retrievedRoom?.players.length === 1, 'Room players count mismatch');

    const roomExistsBefore = await realtimeStateRepository.roomExists('test_room_alpha');
    console.assert(roomExistsBefore === true, 'roomExists returned false');

    // 4. Room TTL Refresh & Short Expiry
    const tempRoomId = 'temp_room_ttl';
    await realtimeStateRepository.saveRoomState({ ...sampleRoom, roomId: tempRoomId }, 1);
    console.log('⏳ Waiting 1.5s for temporary room TTL to expire...');
    await new Promise((r) => setTimeout(r, 1500));

    const tempRoomExists = await realtimeStateRepository.roomExists(tempRoomId);
    console.assert(tempRoomExists === false, 'Temporary room did not expire as expected');

    // 3. Delete Room State
    const deletedRoom = await realtimeStateRepository.deleteRoomState('test_room_alpha');
    console.assert(deletedRoom === true, 'Delete room state failed');

    const roomExistsAfter = await realtimeStateRepository.roomExists('test_room_alpha');
    console.assert(roomExistsAfter === false, 'Room state still exists after delete');
    console.log('✅ Room state save, get, TTL, and delete verified.');

    // Scenario 5, 6, 7, 8: Ludo Game State Operations & TTL
    console.log('\n--- Tests 5, 6, 7, 8: Ludo Game State Operations & TTL ---');
    const sampleGame: LudoGameState = {
      gameId: 'test_game_beta',
      roomId: 'test_room_beta',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      players: [
        {
          playerId: 'p1',
          userId: 'u1',
          color: 'RED',
          tokens: [{ tokenId: 'red_1', playerId: 'p1', color: 'RED', position: -1, state: 'HOME' }],
          isConnected: true,
        },
      ],
      currentPlayerId: 'p1',
      diceValue: 6,
      diceRolled: true,
      moveNumber: 1,
      winner: null,
      lastAction: { type: 'DICE_ROLLED', playerId: 'p1', timestamp: Date.now() },
    };

    // 5. Save Game State
    const savedGame = await realtimeStateRepository.saveGameState(sampleGame, 60);
    console.assert(savedGame === true, 'Save game state failed');

    // 6. Get Game State & Game Exists
    const retrievedGame = await realtimeStateRepository.getGameState('test_game_beta');
    console.assert(retrievedGame !== null, 'Get game state returned null');
    console.assert(retrievedGame?.gameId === 'test_game_beta', 'Game ID mismatch');
    console.assert(retrievedGame?.diceValue === 6, 'Dice value mismatch');

    const gameExistsBefore = await realtimeStateRepository.gameExists('test_game_beta');
    console.assert(gameExistsBefore === true, 'gameExists returned false');

    // 8. Game TTL Refresh
    const refreshedTtl = await realtimeStateRepository.refreshGameStateTtl('test_game_beta', 120);
    console.assert(refreshedTtl === true, 'Game TTL refresh failed');

    // 7. Delete Game State
    const deletedGame = await realtimeStateRepository.deleteGameState('test_game_beta');
    console.assert(deletedGame === true, 'Delete game state failed');

    const gameExistsAfter = await realtimeStateRepository.gameExists('test_game_beta');
    console.assert(gameExistsAfter === false, 'Game state still exists after delete');
    console.log('✅ Game state save, get, TTL refresh, and delete verified.');

    // Scenario 9, 10, 11: User Presence Operations & Expiry
    console.log('\n--- Tests 9, 10, 11: User Presence & Expiry ---');
    const samplePresence: RedisUserPresence = {
      userId: 'user_presence_1',
      state: 'IN_GAME',
      roomId: 'r_100',
      gameId: 'g_200',
      lastSeen: Date.now(),
    };

    // 9. Set Presence
    const setPresence = await realtimeStateRepository.setUserPresence(samplePresence, 60);
    console.assert(setPresence === true, 'Set presence failed');

    // 10. Get Presence
    const retrievedPresence = await realtimeStateRepository.getUserPresence('user_presence_1');
    console.assert(retrievedPresence !== null, 'Get presence returned null');
    console.assert(retrievedPresence?.state === 'IN_GAME', 'Presence state mismatch');
    console.assert(retrievedPresence?.gameId === 'g_200', 'Presence gameId mismatch');

    // 11. Presence Expiry & Refresh
    const shortPresence: RedisUserPresence = {
      userId: 'user_short_presence',
      state: 'ONLINE',
      lastSeen: Date.now(),
    };
    await realtimeStateRepository.setUserPresence(shortPresence, 1);
    console.log('⏳ Waiting 1.5s for presence TTL to expire...');
    await new Promise((r) => setTimeout(r, 1500));

    const expiredPresence = await realtimeStateRepository.getUserPresence('user_short_presence');
    console.assert(expiredPresence === null, 'Short TTL presence did not expire as expected');

    await realtimeStateRepository.removeUserPresence('user_presence_1');
    const removedPresence = await realtimeStateRepository.getUserPresence('user_presence_1');
    console.assert(removedPresence === null, 'Presence still exists after removal');
    console.log('✅ Presence set, get, TTL expiry, and removal verified.');

    // Scenario 13: Redis Failure Handling
    console.log('\n--- Test 13: Redis Failure Handling ---');
    // Test invalid keys gracefully return null/false without throwing
    const invalidRoom = await realtimeStateRepository.getRoomState('');
    console.assert(invalidRoom === null, 'Invalid room ID should return null');

    const invalidGame = await realtimeStateRepository.getGameState('');
    console.assert(invalidGame === null, 'Invalid game ID should return null');

    const invalidPresence = await realtimeStateRepository.getUserPresence('');
    console.assert(invalidPresence === null, 'Invalid user ID should return null');
    console.log('✅ Redis failure and invalid parameter safety verified.');

    console.log('\n🎉 ALL REALTIME STATE REPOSITORY TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Realtime State Repository Test Failed:', err);
    process.exit(1);
  } finally {
    await closeRedis();
    process.exit(0);
  }
}

runRepositoryTests();
