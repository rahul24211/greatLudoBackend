import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface LeagueMatchAttributes {
  id: string;
  leagueId: string;
  gameId: string;
  winnerId?: string;
  pointsAwarded: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LeagueMatchCreationAttributes = Optional<
  LeagueMatchAttributes,
  'id' | 'winnerId' | 'pointsAwarded' | 'createdAt' | 'updatedAt'
>;

export class LeagueMatch extends Model<LeagueMatchAttributes, LeagueMatchCreationAttributes> implements LeagueMatchAttributes {
  public declare id: string;
  public declare leagueId: string;
  public declare gameId: string;
  public declare winnerId: string;
  public declare pointsAwarded: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

LeagueMatch.init(
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
    gameId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    pointsAwarded: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
    },
  },
  {
    sequelize,
    tableName: 'league_matches',
    timestamps: true,
  }
);

export default LeagueMatch;
