import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface WalletAttributes {
  id: string;
  userId: string;
  depositBalance: number;
  winningsBalance: number;
  bonusBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalWon: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WalletCreationAttributes = Optional<
  WalletAttributes,
  | 'id'
  | 'depositBalance'
  | 'winningsBalance'
  | 'bonusBalance'
  | 'totalDeposited'
  | 'totalWithdrawn'
  | 'totalWon'
  | 'createdAt'
  | 'updatedAt'
>;

export class Wallet
  extends Model<WalletAttributes, WalletCreationAttributes>
  implements WalletAttributes
{
  public declare id: string;
  public declare userId: string;
  public declare depositBalance: number;
  public declare winningsBalance: number;
  public declare bonusBalance: number;
  public declare totalDeposited: number;
  public declare totalWithdrawn: number;
  public declare totalWon: number;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Wallet.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    depositBalance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    winningsBalance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    bonusBalance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 50, // Default ₹50 welcome bonus
    },
    totalDeposited: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    totalWithdrawn: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    totalWon: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'wallets',
    timestamps: true,
    indexes: [{ unique: true, fields: ['userId'] }],
  }
);

export default Wallet;
