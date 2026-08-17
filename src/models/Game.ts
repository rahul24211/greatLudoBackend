import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type GameModeType =
  | 'CLASSIC'
  | 'QUICK'
  | 'PRIVATE'
  | 'TOURNAMENT'
  | 'LEAGUE'
  | 'MOVES'
  | 'ONE_TOKEN'
  | 'SNAKE_LADDER'
  | 'TEAM';

export type GameStatusType = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface GameAttributes {
  id: string;
  mode: GameModeType;
  status: GameStatusType;
  roomId?: string;
  currentPlayerId?: string;
  winnerId?: string;
  moveNumber: number;
  maxMoves?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GameCreationAttributes = Optional<
  GameAttributes,
  'id' | 'roomId' | 'currentPlayerId' | 'winnerId' | 'moveNumber' | 'maxMoves' | 'createdAt' | 'updatedAt'
>;

export class Game extends Model<GameAttributes, GameCreationAttributes> implements GameAttributes {
  public declare id: string;
  public declare mode: GameModeType;
  public declare status: GameStatusType;
  public declare roomId: string;
  public declare currentPlayerId: string;
  public declare winnerId: string;
  public declare moveNumber: number;
  public declare maxMoves: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Game.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    mode: {
      type: DataTypes.ENUM(
        'CLASSIC',
        'QUICK',
        'PRIVATE',
        'TOURNAMENT',
        'LEAGUE',
        'MOVES',
        'ONE_TOKEN',
        'SNAKE_LADDER',
        'TEAM'
      ),
      allowNull: false,
      defaultValue: 'CLASSIC',
    },
    status: {
      type: DataTypes.ENUM('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'WAITING',
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    currentPlayerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    moveNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxMoves: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'games',
    timestamps: true,
  }
);

export default Game;
