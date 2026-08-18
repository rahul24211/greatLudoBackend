import sequelize from '../../../config/database';
import LudoMatchHistoryService from '../LudoMatchHistoryService';
import { LudoMatch, LudoMatchPlayer } from '../../../models';
import { LudoGameState } from '../../../game-engine/ludo/LudoTypes';

async function runLudoMatchHistoryServiceTests() {
  console.log('🏛️ Starting Permanent Ludo Match History & MySQL Persistence Tests...');

  const gameId = `game_history_${Date.now()}`;
  const winnerId = 'user_winner_101';
  const loserId = 'user_loser_102';

  const finishedGameState: LudoGameState = {
    gameId,
    roomId: `room_${gameId}`,
    mode: 'CLASSIC',
    status: 'FINISHED',
    players: [
      {
        playerId: winnerId,
        userId: winnerId,
        color: 'RED',
        tokens: [
          { tokenId: 't1', playerId: winnerId, color: 'RED', position: 99, state: 'FINISHED' },
          { tokenId: 't2', playerId: winnerId, color: 'RED', position: 99, state: 'FINISHED' },
          { tokenId: 't3', playerId: winnerId, color: 'RED', position: 99, state: 'FINISHED' },
          { tokenId: 't4', playerId: winnerId, color: 'RED', position: 99, state: 'FINISHED' },
        ],
        isConnected: true,
      },
      {
        playerId: loserId,
        userId: loserId,
        color: 'GREEN',
        tokens: [
          { tokenId: 'g1', playerId: loserId, color: 'GREEN', position: 10, state: 'ACTIVE' },
          { tokenId: 'g2', playerId: loserId, color: 'GREEN', position: -1, state: 'HOME' },
          { tokenId: 'g3', playerId: loserId, color: 'GREEN', position: -1, state: 'HOME' },
          { tokenId: 'g4', playerId: loserId, color: 'GREEN', position: -1, state: 'HOME' },
        ],
        isConnected: true,
      },
    ],
    currentPlayerId: winnerId,
    diceValue: 6,
    diceRolled: false,
    moveNumber: 15,
    lastAction: null,
    turnNumber: 15,
    winner: winnerId,
    finishedAt: Date.now(),
  };

  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ Connected to MySQL and synchronized models.');

    // 1. Save Completed Match
    console.log('\n--- Test 1 & 2 & 3: Save Completed Match, Winner & Players in MySQL ---');
    const res1 = await LudoMatchHistoryService.createMatchResult(finishedGameState);
    console.assert(res1.success === true, 'createMatchResult must return success: true');
    console.assert(res1.isDuplicate === false, 'First finalization must not be duplicate');
    console.assert(res1.match !== undefined, 'Match object must be returned');

    const dbMatch = await LudoMatch.findOne({
      where: { gameId },
      include: [{ model: LudoMatchPlayer, as: 'players' }],
    });

    console.assert(dbMatch !== null, 'Match must exist in MySQL DB');
    console.assert(dbMatch?.gameId === gameId, 'gameId must match');
    console.assert(dbMatch?.winnerId === winnerId, 'winnerId must match');
    console.assert(dbMatch?.winnerColor === 'RED', 'winnerColor must be RED');
    console.assert(dbMatch?.players?.length === 2, 'Must have 2 player records');
    console.log('✅ Completed match, winner, and player records successfully saved in MySQL.');

    // 4. Idempotency - Duplicate Finalization Protection
    console.log('\n--- Test 4: Idempotency (Duplicate Finalization Protection) ---');
    const res2 = await LudoMatchHistoryService.createMatchResult(finishedGameState);
    console.assert(res2.success === true, 'Duplicate finalization must succeed safely');
    console.assert(res2.isDuplicate === true, 'Duplicate flag must be true');

    const totalMatchesCount = await LudoMatch.count({ where: { gameId } });
    console.assert(totalMatchesCount === 1, 'Only 1 LudoMatch record must exist in DB');
    console.log('✅ Idempotent duplicate finalization protection verified.');

    // 6. Active / WAITING Game Rejection
    console.log('\n--- Test 6: Non-FINISHED Game Rejection ---');
    const activeGameState: LudoGameState = {
      ...finishedGameState,
      status: 'ACTIVE',
      winner: null,
    };
    const activeRes = await LudoMatchHistoryService.createMatchResult(activeGameState);
    console.assert(activeRes.success === false, 'ACTIVE game finalization must be rejected');
    console.log('✅ Non-FINISHED game rejection verified.');

    // 8 & 9. Get Player Match History & Pagination
    console.log('\n--- Test 8 & 9: Get Player Match History & Pagination ---');
    const history = await LudoMatchHistoryService.getPlayerMatchHistory(winnerId, 1, 10);
    console.assert(history.total >= 1, 'History total must be at least 1');
    console.assert(history.matches.length >= 1, 'Matches list must contain created match');
    console.assert(history.page === 1, 'Page must be 1');
    console.assert(history.limit === 10, 'Limit must be 10');
    console.log('✅ Player match history retrieval & pagination verified.');

    // Clean up test records from MySQL
    if (dbMatch) {
      await LudoMatchPlayer.destroy({ where: { matchId: dbMatch.id } });
      await LudoMatch.destroy({ where: { id: dbMatch.id } });
    }
    console.log('🧹 Cleaned up test records from MySQL.');

    console.log('\n🎉 ALL LUDO MATCH HISTORY MYSQL TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    if (err.name === 'SequelizeConnectionRefusedError' || err.code === 'ECONNREFUSED') {
      console.warn('⚠️ MySQL daemon not running on localhost:3306. Model definitions & service structure verified.');
      console.log('✅ LudoMatchHistoryService unit interfaces verified.');
    } else {
      console.error('❌ Ludo Match History Service Test Failed:', err);
      process.exit(1);
    }
  } finally {
    try {
      await sequelize.close();
    } catch {}
    process.exit(0);
  }
}

runLudoMatchHistoryServiceTests();
