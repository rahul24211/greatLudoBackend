import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'GAME_ENTRY'
  | 'GAME_WIN'
  | 'GAME_REFUND'
  | 'BONUS_CREDIT';

export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface TransactionAttributes {
  id: string;
  userId: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  description: string;
  paymentMethod?: string;
  metadata?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionCreationAttributes = Optional<
  TransactionAttributes,
  | 'id'
  | 'status'
  | 'referenceId'
  | 'paymentMethod'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
>;

export class Transaction
  extends Model<TransactionAttributes, TransactionCreationAttributes>
  implements TransactionAttributes
{
  public declare id: string;
  public declare userId: string;
  public declare walletId: string;
  public declare type: TransactionType;
  public declare amount: number;
  public declare status: TransactionStatus;
  public declare balanceBefore: number;
  public declare balanceAfter: number;
  public declare referenceId?: string;
  public declare description: string;
  public declare paymentMethod?: string;
  public declare metadata?: any;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

Transaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        'DEPOSIT',
        'WITHDRAWAL',
        'GAME_ENTRY',
        'GAME_WIN',
        'GAME_REFUND',
        'BONUS_CREDIT'
      ),
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'),
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
    balanceBefore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    referenceId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'transactions',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['walletId'] },
      { fields: ['type'] },
      { fields: ['referenceId'] },
    ],
  }
);

export default Transaction;
