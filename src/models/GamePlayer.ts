import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type PlayerColorType = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export interface GamePlayerAttributes {
  id: string;
  gameId: string;
  userId: string;
  teamId?: number;
  color: PlayerColorType;
  position: number;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GamePlayerCreationAttributes = Optional<
  GamePlayerAttributes,
  'id' | 'teamId' | 'position' | 'isReady' | 'isConnected' | 'score' | 'createdAt' | 'updatedAt'
>;

export class GamePlayer extends Model<GamePlayerAttributes, GamePlayerCreationAttributes> implements GamePlayerAttributes {
  public declare id: string;
  public declare gameId: string;
  public declare userId: string;
  public declare teamId: number;
  public declare color: PlayerColorType;
  public declare position: number;
  public declare isReady: boolean;
  public declare isConnected: boolean;
  public declare score: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

GamePlayer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    teamId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    color: {
      type: DataTypes.ENUM('RED', 'GREEN', 'YELLOW', 'BLUE'),
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isReady: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isConnected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'game_players',
    timestamps: true,
  }
);

export default GamePlayer;
