import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type PeriodType = 'GLOBAL' | 'WEEKLY' | 'MONTHLY';

export interface LeaderboardAttributes {
  id: string;
  userId: string;
  period: PeriodType;
  rank: number;
  score: number;
  wins: number;
  coinsWon: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LeaderboardCreationAttributes = Optional<
  LeaderboardAttributes,
  'id' | 'period' | 'rank' | 'score' | 'wins' | 'coinsWon' | 'createdAt' | 'updatedAt'
>;

export class Leaderboard extends Model<LeaderboardAttributes, LeaderboardCreationAttributes> implements LeaderboardAttributes {
  public declare id: string;
  public declare userId: string;
  public declare period: PeriodType;
  public declare rank: number;
  public declare score: number;
  public declare wins: number;
  public declare coinsWon: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Leaderboard.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    period: {
      type: DataTypes.ENUM('GLOBAL', 'WEEKLY', 'MONTHLY'),
      allowNull: false,
      defaultValue: 'GLOBAL',
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    coinsWon: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'leaderboard',
    timestamps: true,
  }
);

export default Leaderboard;
