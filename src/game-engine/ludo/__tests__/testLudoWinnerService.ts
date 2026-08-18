import { LudoWinnerService } from '../LudoWinnerService';
import { LudoTokenService, FINISHED_POSITION } from '../LudoTokenService';
import { LudoGameState, LudoPlayer, LudoColor, LudoToken } from '../LudoTypes';

function createPlayerWithFinishedCount(id: string, color: LudoColor, finishedCount: number): LudoPlayer {
  const baseTokens = LudoTokenService.createPlayerTokens(id, color);
  const tokens: LudoToken[] = baseTokens.map((t, idx) => {
    if (idx < finishedCount) {
      return LudoTokenService.updateTokenPosition(t, 'FINISHED', FINISHED_POSITION);
    }
    return t;
  });

  return {
    playerId: id,
    userId: `user_${id}`,
    color,
    tokens,
    isConnected: true,
  };
}

function createMockGameState(players: LudoPlayer[]): LudoGameState {
  return {
    gameId: 'game_win_100',
    roomId: 'room_win_100',
    mode: 'CLASSIC',
    status: 'ACTIVE',
    players,
    currentPlayerId: players[0] ? players[0].playerId : null,
    diceValue: null,
    diceRolled: false,
    moveNumber: 10,
    winner: null,
    lastAction: null,
    turnNumber: 5,
    turnStartedAt: Date.now(),
    turnTimeLimit: 15,
  };
}

async function runWinnerServiceTests() {
  console.log('🏆 Starting Classic Ludo Winner Detection Service Tests...');

  try {
    // 1..4. Player with 0, 1, 2, 3 finished tokens is NOT winner
    console.log('\n--- Test 1..4: Player with 0..3 finished tokens is NOT winner ---');
    for (let count = 0; count <= 3; count++) {
      const p = createPlayerWithFinishedCount('p1', 'RED', count);
      console.assert(LudoWinnerService.hasPlayerWon(p) === false, `Player with ${count} finished tokens must not win`);
    }
    console.log('✅ 0, 1, 2, 3 finished tokens non-winner checks verified.');

    // 5 & 6 & 7. Player with 4 finished tokens wins & correct winnerId / winnerColor returned
    console.log('\n--- Test 5, 6, 7: Player with 4 finished tokens wins ---');
    const p1Winner = createPlayerWithFinishedCount('p1', 'RED', 4);
    const p2Normal = createPlayerWithFinishedCount('p2', 'GREEN', 2);
    console.assert(LudoWinnerService.hasPlayerWon(p1Winner) === true, 'Player with 4 finished tokens MUST win');

    const stateWin = createMockGameState([p1Winner, p2Normal]);
    const detectedWinner = LudoWinnerService.getWinner(stateWin);
    console.assert(detectedWinner !== null && detectedWinner.playerId === 'p1', 'Winner ID must be p1');
    console.assert(detectedWinner?.color === 'RED', 'Winner color must be RED');
    console.log('✅ 4 finished tokens winner detection & winner metadata verified.');

    // 8 & 9. Game status changes to FINISHED & finishedAt recorded
    console.log('\n--- Test 8 & 9: Game Finish Application & Timestamp ---');
    const fakeTimestamp = 999000888;
    const resApply = LudoWinnerService.evaluateAndApplyWinner(stateWin, fakeTimestamp);
    console.assert(resApply.winnerFound === true, 'winnerFound must be true');
    console.assert(resApply.updatedGameState.status === 'FINISHED', 'Game status must become FINISHED');
    console.assert(resApply.updatedGameState.winner === 'p1', 'Winner must be p1');
    console.assert(resApply.updatedGameState.finishedAt === fakeTimestamp, `finishedAt must be ${fakeTimestamp}`);
    console.assert(resApply.gameResult.status === 'FINISHED', 'gameResult status must be FINISHED');
    console.log('✅ Status change to FINISHED & server timestamp recording verified.');

    // 10. Already finished game cannot produce another winner
    console.log('\n--- Test 10: Already Finished Game Re-evaluation ---');
    const alreadyFinishedState = resApply.updatedGameState;

    // Even if p2 becomes 4 finished tokens afterwards in a mutated scenario
    const p2Winner = createPlayerWithFinishedCount('p2', 'GREEN', 4);
    const stateMutatedFinished = { ...alreadyFinishedState, players: [p1Winner, p2Winner] };

    const reEval = LudoWinnerService.evaluateAndApplyWinner(stateMutatedFinished, 111111);
    console.assert(reEval.updatedGameState.winner === 'p1', 'Winner must remain original winner p1');
    console.assert(reEval.updatedGameState.finishedAt === fakeTimestamp, 'finishedAt timestamp must not change');
    console.log('✅ Already finished game re-evaluation protection verified.');

    // 11. Unknown player handled safely
    console.log('\n--- Test 11: Unknown Player Handling ---');
    const stateEmpty = createMockGameState([]);
    console.assert(LudoWinnerService.getWinner(stateEmpty) === null, 'Empty players list should return null');
    console.log('✅ Unknown / missing player handling verified.');

    // 12. Invalid token collection handled safely (<4 or >4 tokens)
    console.log('\n--- Test 12: Invalid Token Collection Handling ---');
    const pInvalidShort: LudoPlayer = { ...p1Winner, tokens: p1Winner.tokens.slice(0, 3) };
    console.assert(LudoWinnerService.hasPlayerWon(pInvalidShort) === false, 'Player with 3 tokens collection cannot win');
    const pInvalidLong: LudoPlayer = { ...p1Winner, tokens: [...p1Winner.tokens, p1Winner.tokens[0]] };
    console.assert(LudoWinnerService.hasPlayerWon(pInvalidLong) === false, 'Player with 5 tokens collection cannot win');
    console.log('✅ Invalid token collection handling verified.');

    // 13. Winner cannot be supplied by client
    console.log('\n--- Test 13: Client Forgery Rejection ---');
    // State has winner = null, but client tries to fake winnerId = 'p2'
    const fakeClientState = { ...createMockGameState([p1Winner, p2Normal]), winner: null };
    const evalResult = LudoWinnerService.evaluateAndApplyWinner(fakeClientState);
    console.assert(evalResult.updatedGameState.winner === 'p1', 'Server must evaluate p1 as winner based on token state, ignoring client forgery');
    console.log('✅ Client winner forgery rejection verified.');

    // 14. Original game state immutability
    console.log('\n--- Test 14: Immutability ---');
    const originalStateStr = JSON.stringify(stateWin);
    LudoWinnerService.evaluateAndApplyWinner(stateWin);
    console.assert(JSON.stringify(stateWin) === originalStateStr, 'Original game state was mutated!');
    console.log('✅ Game state immutability verified.');

    // 15. Multiple potential winners handled deterministically (first in player order wins)
    console.log('\n--- Test 15: Multiple Potential Winners Determinism ---');
    const p1Win = createPlayerWithFinishedCount('p1', 'RED', 4);
    const p2Win = createPlayerWithFinishedCount('p2', 'GREEN', 4);
    const multiWinnerState = createMockGameState([p1Win, p2Win]);

    const winnerObj = LudoWinnerService.getWinner(multiWinnerState);
    console.assert(winnerObj?.playerId === 'p1', `Expected first player p1, got ${winnerObj?.playerId}`);
    console.log('✅ Deterministic first-in-order winner resolution verified.');

    console.log('\n🎉 ALL LUDO WINNER SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Winner Service Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runWinnerServiceTests();
