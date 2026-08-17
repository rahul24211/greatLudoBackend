import bcrypt from 'bcryptjs';
import sequelize from '../config/database';
import {
  User,
  Profile,
  Room,
  Tournament,
  League,
  Leaderboard,
} from '../models';

export const runSeeders = async (): Promise<void> => {
  try {
    console.log('🌱 Seeding database development records...');
    await sequelize.sync();

    const passwordHash = await bcrypt.hash('password123', 10);

    // Seed Sample Users
    const user1 = await User.findOrCreate({
      where: { email: 'admin@ludoarena.com' },
      defaults: {
        username: 'LudoHost',
        email: 'admin@ludoarena.com',
        passwordHash,
        coins: 50000,
        xp: 1200,
        level: 15,
        status: 'ACTIVE',
      },
    });

    const user2 = await User.findOrCreate({
      where: { email: 'player1@ludoarena.com' },
      defaults: {
        username: 'CyberRoller',
        email: 'player1@ludoarena.com',
        passwordHash,
        coins: 15000,
        xp: 450,
        level: 5,
        status: 'ACTIVE',
      },
    });

    // Seed User Profiles
    if (user1[0]) {
      await Profile.findOrCreate({
        where: { userId: user1[0].id },
        defaults: {
          userId: user1[0].id,
          bio: 'Official Ludo Arena Tournament Champion 🏆',
          rankTitle: 'Grandmaster',
          totalMatches: 120,
          wins: 95,
          losses: 25,
          winRate: 79.16,
          highestWinStreak: 12,
          currentWinStreak: 4,
        },
      });
    }

    if (user2[0]) {
      await Profile.findOrCreate({
        where: { userId: user2[0].id },
        defaults: {
          userId: user2[0].id,
          bio: 'Ludo enthusiast & blitz specialist ⚡',
          rankTitle: 'Gold Roller',
          totalMatches: 45,
          wins: 28,
          losses: 17,
          winRate: 62.22,
          highestWinStreak: 6,
          currentWinStreak: 2,
        },
      });
    }

    // Seed Sample Room
    if (user1[0]) {
      await Room.findOrCreate({
        where: { code: '849201' },
        defaults: {
          code: '849201',
          hostId: user1[0].id,
          gameMode: 'CLASSIC',
          maxPlayers: 4,
          status: 'WAITING',
        },
      });
    }

    // Seed Sample Tournament
    await Tournament.findOrCreate({
      where: { title: 'Ludo Arena Summer Esports Cup 2026' },
      defaults: {
        title: 'Ludo Arena Summer Esports Cup 2026',
        description: 'Compete against 64 players for a 100,000 Coin prize pool!',
        mode: 'CLASSIC',
        entryFee: 500,
        prizePool: 100000,
        maxParticipants: 64,
        status: 'UPCOMING',
        startTime: new Date(Date.now() + 86400000 * 2),
      },
    });

    // Seed Sample League
    await League.findOrCreate({
      where: { seasonName: 'Season 1 Ranked Series' },
      defaults: {
        seasonName: 'Season 1 Ranked Series',
        division: 'GOLD',
        minPoints: 1000,
        maxPoints: 2499,
        status: 'ACTIVE',
      },
    });

    // Seed Sample Leaderboard
    if (user1[0]) {
      await Leaderboard.findOrCreate({
        where: { userId: user1[0].id, period: 'GLOBAL' },
        defaults: {
          userId: user1[0].id,
          period: 'GLOBAL',
          rank: 1,
          score: 3450,
          wins: 95,
          coinsWon: 250000,
        },
      });
    }

    console.log('✅ Development database seeded successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  }
};

runSeeders();
