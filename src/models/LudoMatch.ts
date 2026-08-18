import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface LudoMatchAttributes {
  id: string;
  gameId: string;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  gameMode: string;
  winnerId?: string | null;
  winnerColor?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LudoMatchCreationAttributes = Optional<
  LudoMatchAttributes,
  'id' | 'winnerId' | 'winnerColor' | 'startedAt' | 'finishedAt' | 'createdAt' | 'updatedAt'
>;

export class LudoMatch
  extends Model<LudoMatchAttributes, LudoMatchCreationAttributes>
  implements LudoMatchAttributes
{
  public declare id: string;
  public declare gameId: string;
  public declare status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  public declare gameMode: string;
  public declare winnerId: string | null;
  public declare winnerColor: string | null;
  public declare startedAt: Date | null;
  public declare finishedAt: Date | null;
  public declare players?: any[];
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

LudoMatch.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM('WAITING', 'ACTIVE', 'FINISHED'),
      allowNull: false,
      defaultValue: 'FINISHED',
    },
    gameMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'CLASSIC',
    },
    winnerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    winnerColor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'ludo_matches',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['gameId'] },
      { fields: ['winnerId'] },
      { fields: ['finishedAt'] },
    ],
  }
);

export default LudoMatch;
