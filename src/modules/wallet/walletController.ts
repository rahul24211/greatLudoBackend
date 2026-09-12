import { Request, Response, NextFunction } from 'express';
import WalletService from './walletService';

export class WalletController {
  /**
   * GET /api/wallet/balance
   */
  public static async getBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const balanceData = await WalletService.getWalletBalance(userId as string);
      return res.status(200).json({
        success: true,
        data: balanceData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/wallet/deposit/create-order
   */
  public static async createDepositOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || req.body.userId || req.headers['x-user-id'];
      const { amount } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ success: false, message: 'Valid amount is required' });
      }

      const orderData = await WalletService.createDepositOrder(userId as string, Number(amount));
      return res.status(200).json({
        success: true,
        data: orderData,
      });
    } catch (error: any) {
      if (error.message && error.message.includes('deposit amount')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * POST /api/wallet/deposit/verify-test
   */
  public static async verifyTestDeposit(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || req.body.userId || req.headers['x-user-id'];
      const { orderId, amount, paymentMethod } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ success: false, message: 'Valid amount is required' });
      }

      const result = await WalletService.verifyTestDeposit(
        userId as string,
        orderId || `test_order_${Date.now()}`,
        Number(amount),
        paymentMethod || 'UPI Instant (Test Gateway)'
      );

      return res.status(200).json(result);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * POST /api/wallet/withdraw
   */
  public static async requestWithdrawal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || req.body.userId || req.headers['x-user-id'];
      const { amount, payoutMethod, payoutDetails } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (!amount || isNaN(Number(amount))) {
        return res.status(400).json({ success: false, message: 'Valid withdrawal amount is required' });
      }
      if (!payoutDetails || payoutDetails.trim().length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Valid UPI ID or Bank Details are required',
        });
      }

      const result = await WalletService.requestWithdrawal(
        userId as string,
        Number(amount),
        payoutMethod || 'UPI',
        payoutDetails.trim()
      );

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * GET /api/wallet/transactions
   */
  public static async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const type = req.query.type as string | undefined;

      const data = await WalletService.getUserTransactions(userId as string, page, limit, type);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/wallet/earnings
   */
  public static async getEarnings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const earningsData = await WalletService.getUserEarnings(userId as string);
      return res.status(200).json({
        success: true,
        data: earningsData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/wallet/withdrawals
   */
  public static async getWithdrawals(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id || (req.query.userId as string) || req.headers['x-user-id'];
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const data = await WalletService.getUserWithdrawals(userId as string, page, limit);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/wallet/admin/payouts
   */
  public static async getAdminPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const data = await WalletService.getAdminWithdrawals(status, page, limit);
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/wallet/admin/payouts/:id/approve
   */
  public static async approvePayout(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUserId = (req as any).user?.id || 'admin_super';
      const withdrawalId = String(req.params.id);
      const { utrNumber, adminNote } = req.body;

      const result = await WalletService.approveWithdrawal(
        withdrawalId,
        adminUserId,
        utrNumber,
        adminNote
      );

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  /**
   * POST /api/wallet/admin/payouts/:id/reject
   */
  public static async rejectPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUserId = (req as any).user?.id || 'admin_super';
      const withdrawalId = String(req.params.id);
      const { reason } = req.body;

      const result = await WalletService.rejectWithdrawal(
        withdrawalId,
        adminUserId,
        reason || 'Rejected by administrator'
      );

      return res.status(200).json(result);
    } catch (error: any) {
      if (error.message) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
}

export default WalletController;
