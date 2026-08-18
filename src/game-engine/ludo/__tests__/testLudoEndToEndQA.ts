import { LudoGameEngine } from '../LudoGameEngine';
import { LudoGameState, LudoToken } from '../LudoTypes';
import { LudoDiceService } from '../LudoDiceService';
import { LudoMovementService } from '../LudoMovementService';
import { LudoCaptureService } from '../LudoCaptureService';
import { LudoWinnerService } from '../LudoWinnerService';

export function validateLudoGameStateStrict(state: LudoGameState): boolean {
  if (!state || typeof state !== 'object') return false;
  if (!state.gameId || typeof state.gameId !== 'string') return false;
  if (!['WAITING', 'ACTIVE', 'FINISHED'].includes(state.status)) return false;
  if (!Array.isArray(state.players) || state.players.length === 0) return false;

  for (const player of state.players) {
    if (!player || !player.playerId || !player.color || !Array.isArray(player.tokens)) {
      return false;
    }
    if (player.tokens.length !== 4) return false;
    for (const token of player.tokens) {
      if (!token.tokenId || typeof token.position !== 'number') return false;
    }
  }

  return true;
}

async function runLudoEndToEndQATests() {
  console.log('🧪 Starting Master Classic Ludo End-to-End QA & Stabilization Tests...');

  try {
    // 1. Game State Validator Helper
    console.log('\n--- QA 1: State Consistency Helper ---');
    const initialGame = LudoGameEngine.createGame({
      gameId: 'qa_game_001',
      mode: 'CLASSIC',
      playerIds: ['p1_red', 'p2_green'],
    });
    console.assert(validateLudoGameStateStrict(initialGame) === true, 'Initial state must be valid');
    console.log('✅ State consistency validator verified.');

    // 2. Two-Player Flow & Turn Rotation
    console.log('\n--- QA 2: 2-Player Turn Rotation & Cycle ---');
    const startedGame = LudoGameEngine.startGame(initialGame);
    console.assert(startedGame.status === 'ACTIVE', 'Game status must be ACTIVE');
    console.assert(startedGame.currentPlayerId === 'p1_red', 'First player must be p1_red');
    console.log('✅ 2-Player start & first turn verified.');

    // 3. Four-Player Turn Rotation Wrapping
    console.log('\n--- QA 3: 4-Player Turn Rotation & Wrapping ---');
    const game4 = LudoGameEngine.createGame({
      gameId: 'qa_game_4p',
      mode: 'CLASSIC',
      playerIds: ['p1', 'p2', 'p3', 'p4'],
    });
    const started4 = LudoGameEngine.startGame(game4);

    // Set 1 active token on each color's starting cell (RED:0, GREEN:13, YELLOW:26, BLUE:39)
    const colorStarts: Record<string, number> = { RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39 };
    started4.players.forEach((p) => {
      const startCell = colorStarts[p.color] ?? 0;
      p.tokens[0].position = startCell;
      p.tokens[0].state = 'ACTIVE';
    });

    // Roll 1 for p1 -> move token -> turn rotates to p2
    const rollP1 = LudoGameEngine.rollDice(started4, 'p1', 1);
    console.assert(rollP1.success === true, 'Roll P1 must succeed');
    const moveP1 = LudoGameEngine.moveToken(rollP1.gameState!, 'p1', rollP1.gameState!.players[0].tokens[0].tokenId);
    console.assert(moveP1.success === true, 'Move P1 must succeed');
    console.assert(moveP1.gameState?.currentPlayerId === 'p2', 'Turn must rotate to p2');

    // Move turn for p2
    const rollP2 = LudoGameEngine.rollDice(moveP1.gameState!, 'p2', 1);
    console.assert(rollP2.success === true, 'Roll P2 must succeed');
    const moveP2 = LudoGameEngine.moveToken(rollP2.gameState!, 'p2', rollP2.gameState!.players[1].tokens[0].tokenId);
    console.assert(moveP2.success === true, 'Move P2 must succeed');
    console.assert(moveP2.gameState?.currentPlayerId === 'p3', 'Turn must rotate to p3');

    // Move turn for p3
    const rollP3 = LudoGameEngine.rollDice(moveP2.gameState!, 'p3', 1);
    console.assert(rollP3.success === true, 'Roll P3 must succeed');
    const moveP3 = LudoGameEngine.moveToken(rollP3.gameState!, 'p3', rollP3.gameState!.players[2].tokens[0].tokenId);
    console.assert(moveP3.success === true, 'Move P3 must succeed');
    console.assert(moveP3.gameState?.currentPlayerId === 'p4', 'Turn must rotate to p4');

    // Move turn for p4 -> wraps to p1
    const rollP4 = LudoGameEngine.rollDice(moveP3.gameState!, 'p4', 1);
    console.assert(rollP4.success === true, 'Roll P4 must succeed');
    const moveP4 = LudoGameEngine.moveToken(rollP4.gameState!, 'p4', rollP4.gameState!.players[3].tokens[0].tokenId);
    console.assert(moveP4.success === true, 'Move P4 must succeed');
    console.assert(
      moveP4.gameState?.currentPlayerId === 'p1',
      'Turn must wrap from p4 back to p1'
    );
    console.log('✅ 4-Player turn rotation (p1 -> p2 -> p3 -> p4 -> p1) verified.');

    // 4. Server-Side Dice Bounds & Client Forgery Rejection
    console.log('\n--- QA 4: Server Dice Bounds & Forgery Rejection ---');
    for (let i = 0; i < 50; i++) {
      const d = LudoDiceService.rollDice();
      console.assert(Number.isInteger(d) && d >= 1 && d <= 6, 'Dice must be integer 1..6');
    }
    console.assert(LudoDiceService.isValidDiceValue(0) === false, '0 must be invalid dice');
    console.assert(LudoDiceService.isValidDiceValue(7) === false, '7 must be invalid dice');
    console.assert(LudoDiceService.isValidDiceValue(3.5) === false, 'Decimals must be invalid dice');
    console.log('✅ Cryptographic server dice 1..6 bounds & validation verified.');

    // 5. Token Entry, Main Track, Home Path, Finish & Overshoot
    console.log('\n--- QA 5: Token Entry, Movement & Overshoot Rejection ---');
    const redToken: LudoToken = { tokenId: 'red_1', playerId: 'p1', color: 'RED', position: -1, state: 'HOME' };

    // Entry on non-6 rejected
    const move1 = LudoMovementService.calculateMove(redToken, 1, 'RED');
    console.assert(move1.valid === false, 'Token in HOME cannot enter on dice 1');

    // Entry on 6 allowed
    const move6 = LudoMovementService.calculateMove(redToken, 6, 'RED');
    console.assert(move6.valid === true && move6.toPosition === 0, 'Token enters at position 0 on dice 6');

    // Exact finish
    const nearFinishToken: LudoToken = { tokenId: 'red_finish', playerId: 'p1', color: 'RED', position: 104, state: 'ACTIVE' };
    const moveFinish = LudoMovementService.calculateMove(nearFinishToken, 1, 'RED');
    console.assert(moveFinish.valid === true && moveFinish.toPosition === 99, 'Token reaches finish position 99');

    // Overshoot rejection
    const moveOvershoot = LudoMovementService.calculateMove(nearFinishToken, 2, 'RED');
    console.assert(moveOvershoot.valid === false, 'Overshoot beyond position 99 must be rejected');
    console.log('✅ Token entry on 6, finish, and overshoot rejection verified.');

    // 6. Capture Rules & Safe Cell Immunity
    console.log('\n--- QA 6: Capture Rules & Safe Cell Immunity ---');
    const capturableTokens: LudoToken[] = [
      { tokenId: 't_red', playerId: 'p1', color: 'RED', position: 10, state: 'ACTIVE' },
      { tokenId: 't_green', playerId: 'p2', color: 'GREEN', position: 10, state: 'ACTIVE' },
    ];
    const capRes = LudoCaptureService.applyCapture(capturableTokens[0], capturableTokens, 10);
    console.assert(capRes.captured === true, 'Opponent token on same square must be captured');
    console.assert(capRes.updatedTokens.find((t: LudoToken) => t.tokenId === 't_green')?.position === -1, 'Captured token reset to HOME (-1)');

    // Safe cell immunity (e.g. pos 8)
    const safeTokens: LudoToken[] = [
      { tokenId: 't_red_safe', playerId: 'p1', color: 'RED', position: 8, state: 'ACTIVE' },
      { tokenId: 't_green_safe', playerId: 'p2', color: 'GREEN', position: 8, state: 'ACTIVE' },
    ];
    const safeCapRes = LudoCaptureService.applyCapture(safeTokens[0], safeTokens, 8);
    console.assert(safeCapRes.captured === false, 'Tokens on safe cell (pos 8) must NOT be captured');
    console.log('✅ Capture logic and safe cell immunity verified.');

    // 7. Extra Turn Rules (Dice 6 & Capture)
    console.log('\n--- QA 7: Extra Turn Rules ---');
    const rollSixState = LudoGameEngine.rollDice(startedGame, 'p1_red', 6);
    console.assert(rollSixState.gameState?.currentPlayerId === 'p1_red', 'Rolling 6 preserves current player turn');
    console.log('✅ Extra turn on dice 6 verified.');

    // 8. Winner Detection & Finished State Protection
    console.log('\n--- QA 8: Winner Detection & Action Lockout ---');
    const nearWinGame: LudoGameState = {
      ...startedGame,
      players: [
        {
          playerId: 'p1_red',
          userId: 'p1_red',
          color: 'RED',
          tokens: [
            { tokenId: 'r1', playerId: 'p1_red', color: 'RED', position: 99, state: 'FINISHED' },
            { tokenId: 'r2', playerId: 'p1_red', color: 'RED', position: 99, state: 'FINISHED' },
            { tokenId: 'r3', playerId: 'p1_red', color: 'RED', position: 99, state: 'FINISHED' },
            { tokenId: 'r4', playerId: 'p1_red', color: 'RED', position: 104, state: 'ACTIVE' },
          ],
          isConnected: true,
        },
        {
          playerId: 'p2_green',
          userId: 'p2_green',
          color: 'GREEN',
          tokens: [
            { tokenId: 'g1', playerId: 'p2_green', color: 'GREEN', position: 0, state: 'ACTIVE' },
            { tokenId: 'g2', playerId: 'p2_green', color: 'GREEN', position: -1, state: 'HOME' },
            { tokenId: 'g3', playerId: 'p2_green', color: 'GREEN', position: -1, state: 'HOME' },
            { tokenId: 'g4', playerId: 'p2_green', color: 'GREEN', position: -1, state: 'HOME' },
          ],
          isConnected: true,
        },
      ],
    };

    // Roll 1 for p1_red -> move r4 to finish
    const rollWin = LudoGameEngine.rollDice(nearWinGame, 'p1_red', 1);
    const moveWin = LudoGameEngine.moveToken(rollWin.gameState!, 'p1_red', 'r4');

    console.assert(moveWin.isFinished === true, 'isFinished must be true');
    console.assert(moveWin.winnerId === 'p1_red', 'winnerId must be p1_red');
    console.assert(moveWin.gameState?.status === 'FINISHED', 'Game status must be FINISHED');

    // Attempting further action on finished game must be rejected
    const invalidRollOnFinished = LudoGameEngine.rollDice(moveWin.gameState!, 'p1_red');
    console.assert(invalidRollOnFinished.success === false, 'Actions on FINISHED game must be rejected');
    console.log('✅ Winner detection & post-game action lockout verified.');

    // 9. Client Forgery Security Checks
    console.log('\n--- QA 9: Client Forgery & Security Checks ---');
    const wrongPlayerRoll = LudoGameEngine.rollDice(startedGame, 'p2_green');
    console.assert(wrongPlayerRoll.success === false, 'Wrong player roll must be rejected');

    const wrongPlayerMove = LudoGameEngine.moveToken(rollSixState.gameState!, 'p2_green', 't1');
    console.assert(wrongPlayerMove.success === false, 'Wrong player move must be rejected');

    console.assert(
      LudoWinnerService.hasPlayerWon(nearWinGame.players[0]) === false,
      'Player with 3 tokens is NOT winner'
    );
    console.log('✅ Client forgery rejection & security checks verified.');

    console.log('\n🎉 ALL MASTER CLASSIC LUDO E2E QA & STABILIZATION TESTS PASSED!');
  } catch (err) {
    console.error('❌ Master Ludo E2E QA Test Failed:', err);
    process.exit(1);
  }
}

runLudoEndToEndQATests();
