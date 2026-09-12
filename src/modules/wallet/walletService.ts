import { Wallet, Transaction, WithdrawalRequest, User } from '../../models';

export class WalletService {
  /**
   * Fetch or auto-create a user's wallet (gives ₹50 signup bonus by default)
   */
  public static async getOrCreateWallet(userId: string): Promise<Wallet> {
    // Check if user exists in User table; if not, create guest user
    let user = await User.findByPk(userId).catch(() => null);
    if (!user) {
      const cleanEmail = userId.includes('@') ? userId : `guest_${userId.replace(/[^a-zA-Z0-9]/g, '')}@ludoarena.com`;
      user = await User.findOne({ where: { email: cleanEmail } }).catch(() => null);
      if (!user) {
        user = await User.create({
          id: userId.length === 36 ? userId : undefined,
          username: `Player_${userId.slice(-6).replace(/[^a-zA-Z0-9]/g, '') || Math.floor(1000 + Math.random() * 9000)}`,
          email: cleanEmail,
          passwordHash: 'guest_unauthenticated',
          coins: 1000,
          role: 'USER',
          status: 'ACTIVE',
        }).catch((e) => {
          console.warn('Could not auto-create user record for wallet:', e.message);
          return null;
        });
      }
    }

    const targetUserId = user?.id || userId;
    let wallet = await Wallet.findOne({ where: { userId: targetUserId } }).catch(() => null);
    if (!wallet) {
      wallet = await Wallet.create({
        userId: targetUserId,
        depositBalance: 0,
        winningsBalance: 0,
        bonusBalance: 50, // Welcome ₹50 Bonus
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalWon: 0,
      });

      // Log the welcome bonus transaction
      await Transaction.create({
        userId: targetUserId,
        walletId: wallet.id,
        type: 'BONUS_CREDIT',
        amount: 50,
        status: 'SUCCESS',
        balanceBefore: 0,
        balanceAfter: 50,
        referenceId: `bonus_${wallet.id.substring(0, 8)}`,
        description: 'Welcome Bonus Credited 🎉',
        paymentMethod: 'SYSTEM_PROMO',
      }).catch(() => null);
    }
    return wallet;
  }

  /**
   * Get formatted user balance & statistics
   */
  public static async getWalletBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const totalBalance =
      Math.round((wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance) * 100) /
      100;

    return {
      walletId: wallet.id,
      userId: wallet.userId,
      depositBalance: Math.round(wallet.depositBalance * 100) / 100,
      winningsBalance: Math.round(wallet.winningsBalance * 100) / 100,
      bonusBalance: Math.round(wallet.bonusBalance * 100) / 100,
      totalBalance,
      withdrawableAmount: Math.round(wallet.winningsBalance * 100) / 100,
      totalDeposited: wallet.totalDeposited,
      totalWithdrawn: wallet.totalWithdrawn,
      totalWon: wallet.totalWon,
    };
  }

  /**
   * Create a deposit order for testing or live payment gateway
   */
  public static async createDepositOrder(userId: string, amount: number) {
    if (amount < 10) {
      throw new Error('Minimum deposit amount is ₹10');
    }
    if (amount > 100000) {
      throw new Error('Maximum deposit amount per transaction is ₹1,00,000');
    }

    await this.getOrCreateWallet(userId);
    const orderId = `order_test_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      orderId,
      amount,
      currency: 'INR',
      keyId: 'rzp_test_mock_ludo_arena',
      companyName: 'Ludo Arena Real-Money Gaming',
      description: `Add ₹${amount} to Gaming Wallet`,
      prefill: {
        method: 'upi',
      },
      notes: {
        userId,
        type: 'WALLET_DEPOSIT',
      },
    };
  }

  /**
   * Verify and process deposit from test / live payment gateway
   */
  public static async verifyTestDeposit(
    userId: string,
    orderId: string,
    amount: number,
    paymentMethod: string = 'UPI (Test Gateway)'
  ) {
    const wallet = await this.getOrCreateWallet(userId);
    const totalBefore = wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance;

    const newDepositBalance = Math.round((wallet.depositBalance + amount) * 100) / 100;
    const newTotalDeposited = Math.round((wallet.totalDeposited + amount) * 100) / 100;

    await wallet.update({
      depositBalance: newDepositBalance,
      totalDeposited: newTotalDeposited,
    });

    const totalAfter = totalBefore + amount;

    const txn = await Transaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'DEPOSIT',
      amount,
      status: 'SUCCESS',
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      referenceId: orderId,
      description: `Added ₹${amount} via ${paymentMethod}`,
      paymentMethod,
      metadata: { orderId, amount },
    });

    return {
      success: true,
      transactionId: txn.id,
      newDepositBalance,
      totalBalance: totalAfter,
      message: `₹${amount} deposited successfully to your wallet!`,
    };
  }

  /**
   * Deduct entry stake from user wallet for joining a game
   * Prioritizes Bonus (up to 10%) -> Deposit -> Winnings
   */
  public static async deductGameEntryFee(
    userId: string,
    entryFee: number,
    gameId: string,
    roomCode?: string
  ): Promise<{ success: boolean; message?: string; deductedAmount?: number }> {
    if (entryFee <= 0) return { success: true, deductedAmount: 0 };

    const wallet = await this.getOrCreateWallet(userId);
    const totalAvailable = wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance;

    if (totalAvailable < entryFee) {
      return {
        success: false,
        message: `Insufficient wallet balance. You have ₹${totalAvailable.toFixed(
          2
        )}, but entry requires ₹${entryFee}. Please add cash.`,
      };
    }

    let remainingToDeduct = entryFee;
    let bonusDeducted = 0;
    let depositDeducted = 0;
    let winningsDeducted = 0;

    // 1. Bonus balance deduction (Max 10% of entry fee or whatever is available)
    const maxBonusApplicable = Math.min(entryFee * 0.1, wallet.bonusBalance);
    if (maxBonusApplicable > 0) {
      bonusDeducted = Math.min(maxBonusApplicable, remainingToDeduct);
      remainingToDeduct -= bonusDeducted;
    }

    // 2. Deposit balance deduction
    if (remainingToDeduct > 0 && wallet.depositBalance > 0) {
      depositDeducted = Math.min(wallet.depositBalance, remainingToDeduct);
      remainingToDeduct -= depositDeducted;
    }

    // 3. Winnings balance deduction (if deposit isn't enough)
    if (remainingToDeduct > 0 && wallet.winningsBalance > 0) {
      winningsDeducted = Math.min(wallet.winningsBalance, remainingToDeduct);
      remainingToDeduct -= winningsDeducted;
    }

    const totalBefore = totalAvailable;
    const newBonus = Math.round((wallet.bonusBalance - bonusDeducted) * 100) / 100;
    const newDeposit = Math.round((wallet.depositBalance - depositDeducted) * 100) / 100;
    const newWinnings = Math.round((wallet.winningsBalance - winningsDeducted) * 100) / 100;
    const totalAfter = newBonus + newDeposit + newWinnings;

    await wallet.update({
      bonusBalance: newBonus,
      depositBalance: newDeposit,
      winningsBalance: newWinnings,
    });

    await Transaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'GAME_ENTRY',
      amount: entryFee,
      status: 'SUCCESS',
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      referenceId: gameId,
      description: `Entry fee for Ludo Match #${roomCode || gameId.substring(0, 8)}`,
      paymentMethod: 'WALLET',
      metadata: {
        gameId,
        roomCode,
        breakdown: { bonusDeducted, depositDeducted, winningsDeducted },
      },
    });

    return { success: true, deductedAmount: entryFee };
  }

  /**
   * Credit game win prize to user's Winnings Balance
   */
  public static async creditGameWin(
    userId: string,
    prizeAmount: number,
    gameId: string,
    roomCode?: string
  ) {
    if (prizeAmount <= 0) return;

    const wallet = await this.getOrCreateWallet(userId);
    const totalBefore = wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance;

    const newWinnings = Math.round((wallet.winningsBalance + prizeAmount) * 100) / 100;
    const newTotalWon = Math.round((wallet.totalWon + prizeAmount) * 100) / 100;

    await wallet.update({
      winningsBalance: newWinnings,
      totalWon: newTotalWon,
    });

    const totalAfter = totalBefore + prizeAmount;

    await Transaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'GAME_WIN',
      amount: prizeAmount,
      status: 'SUCCESS',
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      referenceId: gameId,
      description: `Won Ludo Match #${roomCode || gameId.substring(0, 8)} 🏆`,
      paymentMethod: 'MATCH_WINNINGS',
      metadata: { gameId, roomCode, prizeAmount },
    });
  }

  /**
   * Refund entry fee if game is cancelled or aborted
   */
  public static async refundGameEntry(
    userId: string,
    amount: number,
    gameId: string,
    reason: string = 'Match Cancelled'
  ) {
    if (amount <= 0) return;

    const wallet = await this.getOrCreateWallet(userId);
    const totalBefore = wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance;

    // Refund directly to deposit balance
    const newDeposit = Math.round((wallet.depositBalance + amount) * 100) / 100;
    await wallet.update({ depositBalance: newDeposit });

    const totalAfter = totalBefore + amount;

    await Transaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'GAME_REFUND',
      amount,
      status: 'REFUNDED',
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      referenceId: gameId,
      description: `Refund: ${reason} (Match #${gameId.substring(0, 8)})`,
      paymentMethod: 'WALLET_REFUND',
      metadata: { gameId, reason },
    });
  }

  /**
   * Request withdrawal from Winnings Balance to UPI / Bank (Enters PENDING state for Admin Approval)
   */
  public static async requestWithdrawal(
    userId: string,
    amount: number,
    payoutMethod: 'UPI' | 'BANK_TRANSFER',
    payoutDetails: string
  ) {
    if (amount < 50) {
      throw new Error('Minimum withdrawal amount is ₹50');
    }
    if (amount > 50000) {
      throw new Error('Maximum withdrawal per request is ₹50,000');
    }

    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.winningsBalance < amount) {
      throw new Error(
        `Insufficient winnings. You can only withdraw from your Winnings balance (Available: ₹${wallet.winningsBalance.toFixed(
          2
        )})`
      );
    }

    const totalBefore = wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance;
    const newWinnings = Math.round((wallet.winningsBalance - amount) * 100) / 100;

    // Lock winnings balance immediately
    await wallet.update({
      winningsBalance: newWinnings,
    });

    const totalAfter = totalBefore - amount;

    // Create withdrawal request in PENDING review state
    const withdrawal = await WithdrawalRequest.create({
      userId: wallet.userId,
      amount,
      payoutMethod,
      payoutDetails,
      status: 'PENDING',
    });

    // Create transaction record as PENDING hold
    const txn = await Transaction.create({
      userId: wallet.userId,
      walletId: wallet.id,
      type: 'WITHDRAWAL',
      amount,
      status: 'PENDING',
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      referenceId: withdrawal.id,
      description: `Withdrawal Request: ₹${amount} to ${payoutMethod} (${payoutDetails}) - Pending Admin Review ⏳`,
      paymentMethod: payoutMethod,
      metadata: { withdrawalId: withdrawal.id, payoutDetails, status: 'PENDING' },
    });

    return {
      success: true,
      withdrawalId: withdrawal.id,
      transactionId: txn.id,
      amount,
      payoutMethod,
      payoutDetails,
      remainingWinnings: newWinnings,
      status: 'PENDING',
      message: `₹${amount} withdrawal request submitted successfully! It is under admin review.`,
    };
  }

  /**
   * Fetch a user's own withdrawal history
   */
  public static async getUserWithdrawals(userId: string, page: number = 1, limit: number = 20) {
    const wallet = await this.getOrCreateWallet(userId);
    const offset = (page - 1) * limit;

    const { rows, count } = await WithdrawalRequest.findAndCountAll({
      where: { userId: wallet.userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      withdrawals: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Fetch lifetime earnings & payout summary for a user
   */
  public static async getUserEarnings(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    // Calculate pending withdrawal amount
    const pendingWithdrawals = (await WithdrawalRequest.findAll({
      where: { userId: wallet.userId, status: 'PENDING' },
      attributes: ['amount'],
    })) as any[];

    const pendingAmount = pendingWithdrawals.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Count won matches
    const wonMatchesCount = await Transaction.count({
      where: { userId: wallet.userId, type: 'GAME_WIN' },
    });

    return {
      totalWon: wallet.totalWon,
      totalWithdrawn: wallet.totalWithdrawn,
      pendingPayoutAmount: Math.round(pendingAmount * 100) / 100,
      withdrawableBalance: Math.round(wallet.winningsBalance * 100) / 100,
      depositBalance: Math.round(wallet.depositBalance * 100) / 100,
      bonusBalance: Math.round(wallet.bonusBalance * 100) / 100,
      totalBalance:
        Math.round((wallet.depositBalance + wallet.winningsBalance + wallet.bonusBalance) * 100) / 100,
      totalWonMatches: wonMatchesCount,
    };
  }

  /**
   * Admin: Fetch paginated withdrawal requests with filters
   */
  public static async getAdminWithdrawals(
    status?: string,
    page: number = 1,
    limit: number = 20
  ) {
    const offset = (page - 1) * limit;
    const whereClause: any = {};
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    const { rows, count } = await WithdrawalRequest.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const pendingCount = await WithdrawalRequest.count({ where: { status: 'PENDING' } });
    const approvedCount = await WithdrawalRequest.count({ where: { status: 'APPROVED' } });
    const rejectedCount = await WithdrawalRequest.count({ where: { status: 'REJECTED' } });

    return {
      requests: rows,
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: count,
      },
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Admin: Approve a withdrawal request (Marks PAID with UTR)
   */
  public static async approveWithdrawal(
    withdrawalId: string,
    adminUserId: string,
    utrNumber?: string,
    adminNote?: string
  ) {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId);
    if (!withdrawal) {
      throw new Error('Withdrawal request not found');
    }
    if (withdrawal.status !== 'PENDING') {
      throw new Error(`Cannot approve request that is already ${withdrawal.status}`);
    }

    const note = adminNote || (utrNumber ? `UTR / Txn Ref: ${utrNumber}` : 'Approved by Admin');

    await withdrawal.update({
      status: 'APPROVED',
      processedAt: new Date(),
      adminNote: note,
    });

    // Update wallet totalWithdrawn
    const wallet = await Wallet.findOne({ where: { userId: withdrawal.userId } });
    if (wallet) {
      const newTotalWithdrawn = Math.round((wallet.totalWithdrawn + withdrawal.amount) * 100) / 100;
      await wallet.update({ totalWithdrawn: newTotalWithdrawn });
    }

    // Update Transaction to SUCCESS
    const txn = await Transaction.findOne({ where: { referenceId: withdrawal.id } });
    if (txn) {
      await txn.update({
        status: 'SUCCESS',
        description: `Withdrawn ₹${withdrawal.amount} to ${withdrawal.payoutMethod} (${withdrawal.payoutDetails}) - Approved ✅ (${note})`,
        metadata: { ...txn.metadata, utrNumber, adminUserId, approvedAt: new Date() },
      });
    }

    return {
      success: true,
      withdrawalId: withdrawal.id,
      amount: withdrawal.amount,
      message: `Withdrawal request for ₹${withdrawal.amount} approved and marked as PAID! ✅`,
    };
  }

  /**
   * Admin: Reject a withdrawal request (Auto-refunds money back to user Winnings)
   */
  public static async rejectWithdrawal(
    withdrawalId: string,
    adminUserId: string,
    reason: string
  ) {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId);
    if (!withdrawal) {
      throw new Error('Withdrawal request not found');
    }
    if (withdrawal.status !== 'PENDING') {
      throw new Error(`Cannot reject request that is already ${withdrawal.status}`);
    }

    const rejectionReason = reason || 'Invalid payment details or failed security check';

    await withdrawal.update({
      status: 'REJECTED',
      processedAt: new Date(),
      adminNote: rejectionReason,
    });

    // AUTO-REFUND to User's Winnings Balance
    const wallet = await Wallet.findOne({ where: { userId: withdrawal.userId } });
    if (wallet) {
      const newWinnings = Math.round((wallet.winningsBalance + withdrawal.amount) * 100) / 100;
      await wallet.update({ winningsBalance: newWinnings });
    }

    // Update original transaction to REFUNDED
    const txn = await Transaction.findOne({ where: { referenceId: withdrawal.id } });
    if (txn) {
      await txn.update({
        status: 'REFUNDED',
        description: `Withdrawal Rejected: ₹${withdrawal.amount} (Reason: ${rejectionReason}) - Amount Refunded to Wallet 🔄`,
        metadata: { ...txn.metadata, reason: rejectionReason, adminUserId, rejectedAt: new Date() },
      });
    }

    return {
      success: true,
      withdrawalId: withdrawal.id,
      amount: withdrawal.amount,
      message: `Withdrawal rejected. ₹${withdrawal.amount} has been automatically refunded to user's winnings balance.`,
    };
  }

  /**
   * Fetch paginated transactions for user
   */
  public static async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: string
  ) {
    const wallet = await this.getOrCreateWallet(userId);
    const offset = (page - 1) * limit;
    const whereClause: any = { userId: wallet.userId };
    if (type && type !== 'ALL') {
      whereClause.type = type;
    }

    const { rows, count } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      transactions: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
}

export default WalletService;
