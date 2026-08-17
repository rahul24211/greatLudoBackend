import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface RoomPlayerAttributes {
  id: string;
  roomId: string;
  userId: string;
  slotIndex: number;
  isReady: boolean;
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RoomPlayerCreationAttributes = Optional<
  RoomPlayerAttributes,
  'id' | 'isReady' | 'joinedAt' | 'createdAt' | 'updatedAt'
>;

export class RoomPlayer extends Model<RoomPlayerAttributes, RoomPlayerCreationAttributes> implements RoomPlayerAttributes {
  public declare id: string;
  public declare roomId: string;
  public declare userId: string;
  public declare slotIndex: number;
  public declare isReady: boolean;
  public declare joinedAt: Date;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

RoomPlayer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    slotIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isReady: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'room_players',
    timestamps: true,
  }
);

export default RoomPlayer;
