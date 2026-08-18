import User from './User';
import Profile from './Profile';
import Game from './Game';
import GamePlayer from './GamePlayer';
import GameMove from './GameMove';
import Room from './Room';
import RoomPlayer from './RoomPlayer';
import Tournament from './Tournament';
import TournamentPlayer from './TournamentPlayer';
import TournamentMatch from './TournamentMatch';
import League from './League';
import LeaguePlayer from './LeaguePlayer';
import LeagueMatch from './LeagueMatch';
import Leaderboard from './Leaderboard';
import Notification from './Notification';
import Session from './Session';
import LudoMatch from './LudoMatch';
import LudoMatchPlayer from './LudoMatchPlayer';

// User & Profile (1:1)
User.hasOne(Profile, { foreignKey: 'userId', as: 'profile', onDelete: 'CASCADE' });
Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User & Session (1:N)
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions', onDelete: 'CASCADE' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User & Notification (1:N)
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User & Leaderboard (1:N)
User.hasMany(Leaderboard, { foreignKey: 'userId', as: 'leaderboardEntries', onDelete: 'CASCADE' });
Leaderboard.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Room & Host (User) (1:N)
User.hasMany(Room, { foreignKey: 'hostId', as: 'hostedRooms' });
Room.belongsTo(User, { foreignKey: 'hostId', as: 'host' });

// Room & RoomPlayer (1:N)
Room.hasMany(RoomPlayer, { foreignKey: 'roomId', as: 'players', onDelete: 'CASCADE' });
RoomPlayer.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });

User.hasMany(RoomPlayer, { foreignKey: 'userId', as: 'roomMemberships', onDelete: 'CASCADE' });
RoomPlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Room & Game (1:N)
Room.hasMany(Game, { foreignKey: 'roomId', as: 'games' });
Game.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });

// Game & GamePlayer (1:N)
Game.hasMany(GamePlayer, { foreignKey: 'gameId', as: 'players', onDelete: 'CASCADE' });
GamePlayer.belongsTo(Game, { foreignKey: 'gameId', as: 'game' });

User.hasMany(GamePlayer, { foreignKey: 'userId', as: 'gameParticipations' });
GamePlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Game & GameMove (1:N)
Game.hasMany(GameMove, { foreignKey: 'gameId', as: 'moves', onDelete: 'CASCADE' });
GameMove.belongsTo(Game, { foreignKey: 'gameId', as: 'game' });

User.hasMany(GameMove, { foreignKey: 'playerId', as: 'movesMade' });
GameMove.belongsTo(User, { foreignKey: 'playerId', as: 'player' });

// Tournament & TournamentPlayer & TournamentMatch
Tournament.hasMany(TournamentPlayer, { foreignKey: 'tournamentId', as: 'participants', onDelete: 'CASCADE' });
TournamentPlayer.belongsTo(Tournament, { foreignKey: 'tournamentId', as: 'tournament' });
User.hasMany(TournamentPlayer, { foreignKey: 'userId', as: 'tournamentEntries' });
TournamentPlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Tournament.hasMany(TournamentMatch, { foreignKey: 'tournamentId', as: 'matches', onDelete: 'CASCADE' });
TournamentMatch.belongsTo(Tournament, { foreignKey: 'tournamentId', as: 'tournament' });

// League & LeaguePlayer & LeagueMatch
League.hasMany(LeaguePlayer, { foreignKey: 'leagueId', as: 'members', onDelete: 'CASCADE' });
LeaguePlayer.belongsTo(League, { foreignKey: 'leagueId', as: 'league' });
User.hasMany(LeaguePlayer, { foreignKey: 'userId', as: 'leagueMemberships' });
LeaguePlayer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

League.hasMany(LeagueMatch, { foreignKey: 'leagueId', as: 'matches', onDelete: 'CASCADE' });
LeagueMatch.belongsTo(League, { foreignKey: 'leagueId', as: 'league' });

// LudoMatch & LudoMatchPlayer (1:N)
LudoMatch.hasMany(LudoMatchPlayer, { foreignKey: 'matchId', as: 'players', onDelete: 'CASCADE' });
LudoMatchPlayer.belongsTo(LudoMatch, { foreignKey: 'matchId', as: 'match' });

export {
  User,
  Profile,
  Game,
  GamePlayer,
  GameMove,
  Room,
  RoomPlayer,
  Tournament,
  TournamentPlayer,
  TournamentMatch,
  League,
  LeaguePlayer,
  LeagueMatch,
  Leaderboard,
  Notification,
  Session,
  LudoMatch,
  LudoMatchPlayer,
};
