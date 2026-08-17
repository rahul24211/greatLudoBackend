import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type DivisionType = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'MASTER' | 'GRANDMASTER';
export type LeagueStatusType = 'ACTIVE' | 'CLOSED';

export interface LeagueAttributes {
  id: string;
  seasonName: string;
  division: DivisionType;
  minPoints: number;
  maxPoints: number;
  status: LeagueStatusType;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LeagueCreationAttributes = Optional<
  LeagueAttributes,
  'id' | 'minPoints' | 'maxPoints' | 'status' | 'createdAt' | 'updatedAt'
>;

export class League extends Model<LeagueAttributes, LeagueCreationAttributes> implements LeagueAttributes {
  public declare id: string;
  public declare seasonName: string;
  public declare division: DivisionType;
  public declare minPoints: number;
  public declare maxPoints: number;
  public declare status: LeagueStatusType;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

League.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    seasonName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    division: {
      type: DataTypes.ENUM('BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'MASTER', 'GRANDMASTER'),
      allowNull: false,
      defaultValue: 'BRONZE',
    },
    minPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1000,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CLOSED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    sequelize,
    tableName: 'leagues',
    timestamps: true,
  }
);

export default League;
