import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface GameMoveAttributes {
  id: string;
  gameId: string;
  playerId: string;
  moveNumber: number;
  action: string;
  diceValue?: number;
  tokenId?: string;
  fromPosition?: number;
  toPosition?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GameMoveCreationAttributes = Optional<
  GameMoveAttributes,
  'id' | 'diceValue' | 'tokenId' | 'fromPosition' | 'toPosition' | 'createdAt' | 'updatedAt'
>;

export class GameMove extends Model<GameMoveAttributes, GameMoveCreationAttributes> implements GameMoveAttributes {
  public declare id: string;
  public declare gameId: string;
  public declare playerId: string;
  public declare moveNumber: number;
  public declare action: string;
  public declare diceValue: number;
  public declare tokenId: string;
  public declare fromPosition: number;
  public declare toPosition: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

GameMove.init(
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
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    moveNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    diceValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    tokenId: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    fromPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    toPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'game_moves',
    timestamps: true,
  }
);

export default GameMove;
