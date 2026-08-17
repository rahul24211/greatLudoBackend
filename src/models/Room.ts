import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type RoomStatusType = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface RoomAttributes {
  id: string;
  code: string;
  hostId: string;
  gameMode: string;
  maxPlayers: number;
  status: RoomStatusType;
  passwordHash?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RoomCreationAttributes = Optional<
  RoomAttributes,
  'id' | 'maxPlayers' | 'status' | 'passwordHash' | 'createdAt' | 'updatedAt'
>;

export class Room extends Model<RoomAttributes, RoomCreationAttributes> implements RoomAttributes {
  public declare id: string;
  public declare code: string;
  public declare hostId: string;
  public declare gameMode: string;
  public declare maxPlayers: number;
  public declare status: RoomStatusType;
  public declare passwordHash: string;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Room.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
    },
    hostId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    gameMode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'CLASSIC',
    },
    maxPlayers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
    },
    status: {
      type: DataTypes.ENUM('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'),
      allowNull: false,
      defaultValue: 'WAITING',
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'rooms',
    timestamps: true,
    indexes: [{ unique: true, fields: ['code'] }],
  }
);

export default Room;
