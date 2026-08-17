import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface ProfileAttributes {
  id: string;
  userId: string;
  bio?: string;
  rankTitle: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  highestWinStreak: number;
  currentWinStreak: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProfileCreationAttributes = Optional<
  ProfileAttributes,
  | 'id'
  | 'bio'
  | 'rankTitle'
  | 'totalMatches'
  | 'wins'
  | 'losses'
  | 'winRate'
  | 'highestWinStreak'
  | 'currentWinStreak'
  | 'createdAt'
  | 'updatedAt'
>;

export class Profile extends Model<ProfileAttributes, ProfileCreationAttributes> implements ProfileAttributes {
  public declare id: string;
  public declare userId: string;
  public declare bio: string;
  public declare rankTitle: string;
  public declare totalMatches: number;
  public declare wins: number;
  public declare losses: number;
  public declare winRate: number;
  public declare highestWinStreak: number;
  public declare currentWinStreak: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Profile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rankTitle: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Rookie Roller',
    },
    totalMatches: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    losses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    winRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
    },
    highestWinStreak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    currentWinStreak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'profiles',
    timestamps: true,
  }
);

export default Profile;
