import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface SessionAttributes {
  id: string;
  userId: string;
  refreshToken: string;
  deviceInfo?: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SessionCreationAttributes = Optional<
  SessionAttributes,
  'id' | 'deviceInfo' | 'createdAt' | 'updatedAt'
>;

export class Session extends Model<SessionAttributes, SessionCreationAttributes> implements SessionAttributes {
  public declare id: string;
  public declare userId: string;
  public declare refreshToken: string;
  public declare deviceInfo: string;
  public declare expiresAt: Date;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Session.init(
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
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    deviceInfo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'sessions',
    timestamps: true,
  }
);

export default Session;
