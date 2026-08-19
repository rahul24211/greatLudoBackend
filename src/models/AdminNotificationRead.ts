import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export interface AdminNotificationReadAttributes {
  id: string;
  notificationId: string;
  adminUserId: string;
  readAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AdminNotificationReadCreationAttributes = Optional<
  AdminNotificationReadAttributes,
  'id' | 'readAt' | 'createdAt' | 'updatedAt'
>;

export class AdminNotificationRead
  extends Model<AdminNotificationReadAttributes, AdminNotificationReadCreationAttributes>
  implements AdminNotificationReadAttributes
{
  public declare id: string;
  public declare notificationId: string;
  public declare adminUserId: string;
  public declare readAt: Date;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

AdminNotificationRead.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    notificationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adminUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'admin_notification_reads',
    modelName: 'AdminNotificationRead',
    timestamps: true,
    indexes: [
      { fields: ['notificationId', 'adminUserId'], unique: true },
      { fields: ['adminUserId'] },
    ],
  }
);

export default AdminNotificationRead;
