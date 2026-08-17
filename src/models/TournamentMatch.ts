import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface TournamentMatchAttributes {
  id: string;
  tournamentId: string;
  roundNumber: number;
  gameId?: string;
  winnerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TournamentMatchCreationAttributes = Optional<
  TournamentMatchAttributes,
  'id' | 'gameId' | 'winnerId' | 'createdAt' | 'updatedAt'
>;

export class TournamentMatch extends Model<TournamentMatchAttributes, TournamentMatchCreationAttributes> implements TournamentMatchAttributes {
  public declare id: string;
  public declare tournamentId: string;
  public declare roundNumber: number;
  public declare gameId: string;
  public declare winnerId: string;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

TournamentMatch.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roundNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    winnerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tournament_matches',
    timestamps: true,
  }
);

export default TournamentMatch;
