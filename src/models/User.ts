import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface UserAttributes {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatar?: string;
  coins: number;
  xp: number;
  level: number;
  status: 'ACTIVE' | 'BANNED' | 'SUSPENDED' | 'INACTIVE';
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'VIEWER' | 'USER';
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'avatar' | 'coins' | 'xp' | 'level' | 'status' | 'role' | 'createdAt' | 'updatedAt'
>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public declare id: string;
  public declare username: string;
  public declare email: string;
  public declare passwordHash: string;
  public declare avatar: string;
  public declare coins: number;
  public declare xp: number;
  public declare level: number;
  public declare status: 'ACTIVE' | 'BANNED' | 'SUSPENDED' | 'INACTIVE';
  public declare role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'VIEWER' | 'USER';
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    avatar: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'default_avatar.png',
    },
    coins: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 1000,
    },
    xp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'BANNED', 'SUSPENDED', 'INACTIVE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    role: {
      type: DataTypes.ENUM('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'VIEWER', 'USER'),
      allowNull: false,
      defaultValue: 'USER',
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['username'] },
      { unique: true, fields: ['email'] },
    ],
  }
);

export default User;
