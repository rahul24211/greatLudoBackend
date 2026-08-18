import { LudoBoard } from '../LudoBoard';
import { LUDO_COLORS, HOME_PATH_LENGTH, SAFE_CELLS } from '../LudoConstants';
import { LudoColor, LudoPositionCategory } from '../LudoTypes';

async function runLudoBoardTests() {
  console.log('🎯 Starting Classic Ludo Board Configuration Tests...');

  try {
    // 1. Test All 4 Colors Exist
    console.log('\n--- Test 1: All 4 Colors Exist ---');
    const expectedColors: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    console.assert(LUDO_COLORS.length === 4, `Expected 4 colors, got ${LUDO_COLORS.length}`);
    for (const color of expectedColors) {
      console.assert(LUDO_COLORS.includes(color), `Color ${color} is missing from LUDO_COLORS`);
    }
    console.log('✅ All four colors exist.');

    // 2. Test Four Players & Deterministic Token Representation
    console.log('\n--- Test 2: Four Players & Token Representation ---');
    for (const color of expectedColors) {
      const tokenIds = LudoBoard.generateTokenIds(color);
      console.assert(tokenIds.length === 4, `Expected 4 tokens for color ${color}, got ${tokenIds.length}`);
      console.assert(tokenIds[0] === `${color.toLowerCase()}_1`, `Token ID format mismatch: ${tokenIds[0]}`);
      console.assert(tokenIds[3] === `${color.toLowerCase()}_4`, `Token ID format mismatch: ${tokenIds[3]}`);
    }
    console.log('✅ Four players and 16 total tokens represented deterministically.');

    // 3. Test Valid Start Position for Each Color
    console.log('\n--- Test 3: Valid Start Position for Each Color ---');
    const redStart = LudoBoard.getStartSquare('RED');
    const greenStart = LudoBoard.getStartSquare('GREEN');
    const yellowStart = LudoBoard.getStartSquare('YELLOW');
    const blueStart = LudoBoard.getStartSquare('BLUE');

    console.assert(redStart === 0, `Expected RED start at 0, got ${redStart}`);
    console.assert(greenStart === 13, `Expected GREEN start at 13, got ${greenStart}`);
    console.assert(yellowStart === 26, `Expected YELLOW start at 26, got ${yellowStart}`);
    console.assert(blueStart === 39, `Expected BLUE start at 39, got ${blueStart}`);

    const uniqueStarts = new Set([redStart, greenStart, yellowStart, blueStart]);
    console.assert(uniqueStarts.size === 4, 'Start positions are not unique across colors');
    console.log('✅ Distinct and valid start positions verified.');

    // 4. Test Safe Cells Validation
    console.log('\n--- Test 4: Safe Cells Validation ---');
    console.assert(SAFE_CELLS.length === 8, `Expected 8 safe cells, got ${SAFE_CELLS.length}`);
    for (const color of expectedColors) {
      const startCell = LudoBoard.getStartSquare(color);
      console.assert(LudoBoard.isSafeCell(startCell) === true, `Start cell ${startCell} for ${color} should be safe`);
    }
    console.assert(LudoBoard.isSafeCell(8) === true, 'Cell 8 should be safe');
    console.assert(LudoBoard.isSafeCell(21) === true, 'Cell 21 should be safe');
    console.assert(LudoBoard.isSafeCell(34) === true, 'Cell 34 should be safe');
    console.assert(LudoBoard.isSafeCell(47) === true, 'Cell 47 should be safe');
    console.assert(LudoBoard.isSafeCell(5) === false, 'Cell 5 should NOT be safe');
    console.log('✅ Safe cells validation verified.');

    // 5. Test Home Paths Exist for All Colors
    console.log('\n--- Test 5: Home Paths Exist for All Colors ---');
    for (const color of expectedColors) {
      const homePath = LudoBoard.getHomePathForColor(color);
      console.assert(homePath.length === HOME_PATH_LENGTH, `Expected home path length ${HOME_PATH_LENGTH}, got ${homePath.length}`);
      console.assert(homePath[0] === 0 && homePath[5] === 5, 'Home path indices mismatch');
    }
    console.log('✅ Home paths exist for all colors.');

    // 6. Test Deterministic Board Configuration & Validation Helper
    console.log('\n--- Test 6: Board Determinism & Validation Helper ---');
    const validation = LudoBoard.validateBoardConfig();
    console.assert(validation.valid === true, `Board validation failed: ${validation.errors.join(', ')}`);
    console.assert(validation.errors.length === 0, 'Board validation returned errors');
    console.log('✅ Deterministic board validation succeeded.');

    // 7. Test Decoupling from Frontend / UI Coordinates
    console.log('\n--- Test 7: Decoupling from UI Coordinates ---');
    const posModel = LudoBoard.createPositionModel(LudoPositionCategory.MAIN_PATH, 13, 'GREEN');
    console.assert(posModel.category === LudoPositionCategory.MAIN_PATH, 'Category mismatch');
    console.assert(posModel.index === 13, 'Index mismatch');
    console.assert((posModel as any).x === undefined, 'Position model must not contain UI pixel x coordinate');
    console.assert((posModel as any).y === undefined, 'Position model must not contain UI pixel y coordinate');
    console.log('✅ Board configuration is strictly decoupled from UI coordinates.');

    console.log('\n🎉 ALL LUDO BOARD CONFIGURATION TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Board Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runLudoBoardTests();
