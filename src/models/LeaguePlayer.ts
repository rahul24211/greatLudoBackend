import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface LeaguePlayerAttributes {
  id: string;
  leagueId: string;
  userId: string;
  points: number;
  wins: number;
  losses: number;
  rankPlacement?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LeaguePlayerCreationAttributes = Optional<
  LeaguePlayerAttributes,
  'id' | 'points' | 'wins' | 'losses' | 'rankPlacement' | 'createdAt' | 'updatedAt'
>;

export class LeaguePlayer extends Model<LeaguePlayerAttributes, LeaguePlayerCreationAttributes> implements LeaguePlayerAttributes {
  public declare id: string;
  public declare leagueId: string;
  public declare userId: string;
  public declare points: number;
  public declare wins: number;
  public declare losses: number;
  public declare rankPlacement: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

LeaguePlayer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    points: {
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
    rankPlacement: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'league_players',
    timestamps: true,
  }
);

export default LeaguePlayer;
