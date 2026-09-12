import { Router } from 'express';
import { WalletController } from './walletController';
import { optionalAuthenticateToken } from '../../middleware/authMiddleware';

const router = Router();

router.get('/balance', optionalAuthenticateToken, WalletController.getBalance);
router.get('/earnings', optionalAuthenticateToken, WalletController.getEarnings);
router.get('/withdrawals', optionalAuthenticateToken, WalletController.getWithdrawals);
router.post('/deposit/create-order', optionalAuthenticateToken, WalletController.createDepositOrder);
router.post('/deposit/verify-test', optionalAuthenticateToken, WalletController.verifyTestDeposit);
router.post('/withdraw', optionalAuthenticateToken, WalletController.requestWithdrawal);
router.get('/transactions', optionalAuthenticateToken, WalletController.getTransactions);

// Admin Payout Routes
router.get('/admin/payouts', optionalAuthenticateToken, WalletController.getAdminPayouts);
router.post('/admin/payouts/:id/approve', optionalAuthenticateToken, WalletController.approvePayout);
router.post('/admin/payouts/:id/reject', optionalAuthenticateToken, WalletController.rejectPayout);

export default router;
