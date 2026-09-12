import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
export type PayoutMethod = 'UPI' | 'BANK_TRANSFER';

export interface WithdrawalRequestAttributes {
  id: string;
  userId: string;
  amount: number;
  payoutMethod: PayoutMethod;
  payoutDetails: string; // e.g. UPI ID (user@okhdfcbank) or Account Number + IFSC
  status: WithdrawalStatus;
  adminNote?: string;
  processedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WithdrawalRequestCreationAttributes = Optional<
  WithdrawalRequestAttributes,
  'id' | 'status' | 'adminNote' | 'processedAt' | 'createdAt' | 'updatedAt'
>;

export class WithdrawalRequest
  extends Model<WithdrawalRequestAttributes, WithdrawalRequestCreationAttributes>
  implements WithdrawalRequestAttributes
{
  public declare id: string;
  public declare userId: string;
  public declare amount: number;
  public declare payoutMethod: PayoutMethod;
  public declare payoutDetails: string;
  public declare status: WithdrawalStatus;
  public declare adminNote?: string;
  public declare processedAt?: Date;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

WithdrawalRequest.init(
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
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    payoutMethod: {
      type: DataTypes.ENUM('UPI', 'BANK_TRANSFER'),
      allowNull: false,
      defaultValue: 'UPI',
    },
    payoutDetails: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    adminNote: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'withdrawal_requests',
    timestamps: true,
    indexes: [{ fields: ['userId'] }, { fields: ['status'] }],
  }
);

export default WithdrawalRequest;
