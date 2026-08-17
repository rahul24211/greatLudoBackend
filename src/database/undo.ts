import sequelize from '../config/database';
import '../models';

export const undoMigrations = async (): Promise<void> => {
  try {
    console.log('⚠️ Reverting / dropping all Sequelize tables...');
    await sequelize.drop();
    console.log('✅ Database tables reverted/cleared successfully!');
  } catch (error) {
    console.error('❌ Database undo failed:', error);
  }
};

undoMigrations();
