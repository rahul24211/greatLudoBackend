import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type TournamentStatusType = 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

export interface TournamentAttributes {
  id: string;
  title: string;
  description?: string;
  mode: string;
  entryFee: number;
  prizePool: number;
  maxParticipants: number;
  status: TournamentStatusType;
  startTime?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TournamentCreationAttributes = Optional<
  TournamentAttributes,
  'id' | 'description' | 'entryFee' | 'prizePool' | 'maxParticipants' | 'status' | 'startTime' | 'createdAt' | 'updatedAt'
>;

export class Tournament extends Model<TournamentAttributes, TournamentCreationAttributes> implements TournamentAttributes {
  public declare id: string;
  public declare title: string;
  public declare description: string;
  public declare mode: string;
  public declare entryFee: number;
  public declare prizePool: number;
  public declare maxParticipants: number;
  public declare status: TournamentStatusType;
  public declare startTime: Date;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Tournament.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'CLASSIC',
    },
    entryFee: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    prizePool: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1000,
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 64,
    },
    status: {
      type: DataTypes.ENUM('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'UPCOMING',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tournaments',
    timestamps: true,
  }
);

export default Tournament;
