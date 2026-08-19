import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/database';

export type AdminNotificationSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type AdminNotificationType =
  | 'SYSTEM_HEALTH_CHANGED'
  | 'REDIS_DOWN'
  | 'REDIS_RECOVERED'
  | 'MYSQL_DOWN'
  | 'MYSQL_RECOVERED'
  | 'SOCKET_DOWN'
  | 'SOCKET_RECOVERED'
  | 'HIGH_ERROR_RATE'
  | 'MATCHMAKING_QUEUE_HIGH'
  | 'GAME_FORCE_ENDED'
  | 'USER_DEACTIVATED'
  | 'USER_ACTIVATED'
  | 'SESSION_REVOKED'
  | 'SECURITY_ALERT';

export interface AdminNotificationAttributes {
  id: string;
  type: AdminNotificationType;
  severity: AdminNotificationSeverity;
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AdminNotificationCreationAttributes = Optional<
  AdminNotificationAttributes,
  'id' | 'resourceType' | 'resourceId' | 'metadata' | 'createdAt' | 'updatedAt'
>;

export class AdminNotification
  extends Model<AdminNotificationAttributes, AdminNotificationCreationAttributes>
  implements AdminNotificationAttributes
{
  public declare id: string;
  public declare type: AdminNotificationType;
  public declare severity: AdminNotificationSeverity;
  public declare title: string;
  public declare message: string;
  public declare resourceType: string | null;
  public declare resourceId: string | null;
  public declare metadata: Record<string, any> | null;
  public declare readonly createdAt: Date;
  public declare readonly updatedAt: Date;
}

AdminNotification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('INFO', 'WARNING', 'ERROR', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'INFO',
    },
    title: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    resourceId: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'admin_notifications',
    modelName: 'AdminNotification',
    timestamps: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['severity'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default AdminNotification;
