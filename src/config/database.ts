import { Sequelize } from 'sequelize';
import env from './env';

export const sequelize = new Sequelize(env.dbName, env.dbUser, env.dbPassword, {
  host: env.dbHost,
  port: env.dbPort,
  dialect: 'mysql',
  logging: false,
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
    console.warn('⚠️ Could not connect to MySQL server on port 3306. Initializing SQLite local fallback...');
    try {
      const sqliteSequelize: any = new Sequelize({
        dialect: 'sqlite',
        storage: './ludo_dev.sqlite',
        logging: false,
      });

      const targetSeq: any = sequelize;
      targetSeq.dialect = sqliteSequelize.dialect;
      targetSeq.queryInterface = sqliteSequelize.queryInterface;
      targetSeq.options.dialect = 'sqlite';
      targetSeq.config = sqliteSequelize.config;
      targetSeq.connectionManager = sqliteSequelize.connectionManager;

      require('../models');

      // Sanitize model column attributes & index definitions for SQLite compatibility
      for (const modelName of Object.keys(sequelize.models)) {
        const model: any = sequelize.models[modelName];
        if (model) {
          if (model.rawAttributes) {
            for (const key of Object.keys(model.rawAttributes)) {
              const attr = model.rawAttributes[key];
              if (attr) {
                delete attr.binary;
                delete attr.collate;
                if (attr.type && typeof attr.type === 'object') {
                  delete attr.type.binary;
                  if (attr.type.options) {
                    delete attr.type.options.binary;
                  }
                }
              }
            }
          }
          if (model.options && Array.isArray(model.options.indexes)) {
            model.options.indexes = model.options.indexes.map((idx: any) => {
              const { type, collation, ...clean } = idx;
              return clean;
            });
          }
          if (Array.isArray(model._indexes)) {
            model._indexes = model._indexes.map((idx: any) => {
              const { type, collation, ...clean } = idx;
              return clean;
            });
          }
        }
      }

      await sequelize.authenticate();
      await sequelize.sync({ force: false });
      console.log('✅ Local SQLite fallback database connected & synchronized successfully!');
      return true;
    } catch (fallbackError) {
      console.error('❌ Database fallback initialization failed:', fallbackError instanceof Error ? fallbackError.message : fallbackError);
      return false;
    }
  }
};

export default sequelize;
