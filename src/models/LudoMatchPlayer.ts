import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface LudoMatchPlayerAttributes {
  id: string;
  matchId: string;
  userId: string;
  color: string;
  playerType?: 'HUMAN' | 'BOT';
  finalPosition?: number | null;
  joinedAt?: Date | null;
  leftAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LudoMatchPlayerCreationAttributes = Optional<
  LudoMatchPlayerAttributes,
  'id' | 'playerType' | 'finalPosition' | 'joinedAt' | 'leftAt' | 'createdAt' | 'updatedAt'
>;

export class LudoMatchPlayer
  extends Model<LudoMatchPlayerAttributes, LudoMatchPlayerCreationAttributes>
  implements LudoMatchPlayerAttributes
{
  public declare id: string;
  public declare matchId: string;
  public declare userId: string;
  public declare color: string;
  public declare playerType: 'HUMAN' | 'BOT';
  public declare finalPosition: number | null;
  public declare joinedAt: Date | null;
  public declare leftAt: Date | null;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

LudoMatchPlayer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    matchId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    playerType: {
      type: DataTypes.ENUM('HUMAN', 'BOT'),
      allowNull: false,
      defaultValue: 'HUMAN',
    },
    finalPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'ludo_match_players',
    timestamps: true,
    indexes: [
      { fields: ['matchId'] },
      { fields: ['userId'] },
    ],
  }
);

export default LudoMatchPlayer;
