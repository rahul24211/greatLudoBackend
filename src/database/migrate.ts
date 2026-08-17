import sequelize from '../config/database';
import '../models';

export const runMigrations = async (): Promise<void> => {
  try {
    console.log('🔄 Running Sequelize database migrations...');
    await sequelize.sync({ alter: true });
    console.log('✅ All 16 database tables migrated & synchronized successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

runMigrations();
