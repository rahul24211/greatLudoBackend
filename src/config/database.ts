import { Sequelize } from 'sequelize';
import env from './env';

export const sequelize = new Sequelize(env.dbName, env.dbUser, env.dbPassword, {
  host: env.dbHost,
  port: env.dbPort,
  dialect: 'mysql',
  logging: env.nodeEnv === 'development' ? false : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export const connectDatabase = async (): Promise<boolean> => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL Database connection established successfully via Sequelize.');
    return true;
  } catch (error) {
    console.warn('⚠️ Could not connect to MySQL database. (Ensure MySQL is running on localhost:3306)');
    console.warn('Error details:', error instanceof Error ? error.message : error);
    return false;
  }
};

export default sequelize;
