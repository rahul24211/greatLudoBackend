import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface TournamentPlayerAttributes {
  id: string;
  tournamentId: string;
  userId: string;
  seedNumber?: number;
  rankPlacement?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TournamentPlayerCreationAttributes = Optional<
  TournamentPlayerAttributes,
  'id' | 'seedNumber' | 'rankPlacement' | 'createdAt' | 'updatedAt'
>;

export class TournamentPlayer extends Model<TournamentPlayerAttributes, TournamentPlayerCreationAttributes> implements TournamentPlayerAttributes {
  public declare id: string;
  public declare tournamentId: string;
  public declare userId: string;
  public declare seedNumber: number;
  public declare rankPlacement: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

TournamentPlayer.init(
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    seedNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    rankPlacement: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tournament_players',
    timestamps: true,
  }
);

export default TournamentPlayer;
