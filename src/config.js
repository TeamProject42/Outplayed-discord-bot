require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  // Supported games and their rank systems
  games: {
    valorant: {
      name: 'Valorant',
      emoji: '🎯',
      ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'],
    },
    cs2: {
      name: 'CS2',
      emoji: '🔫',
      ranks: ['Silver', 'Gold Nova', 'Master Guardian', 'Legendary Eagle', 'Supreme', 'Global Elite'],
    },
    fortnite: {
      name: 'Fortnite',
      emoji: '🏗️',
      ranks: ['Open', 'Contender', 'Champion', 'Unreal'],
    },
    apex: {
      name: 'Apex Legends',
      emoji: '🦾',
      ranks: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Predator'],
    },
    league: {
      name: 'League of Legends',
      emoji: '⚔️',
      ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'],
    },
  },

  // Rank bucket mapping for matchmaking (low / mid / high)
  getRankBucket(game, rank) {
    const ranks = this.games[game]?.ranks || [];
    const index = ranks.indexOf(rank);
    if (index === -1) return 'mid';
    const third = Math.ceil(ranks.length / 3);
    if (index < third) return 'low';
    if (index < third * 2) return 'mid';
    return 'high';
  },

  // Branding
  embedColor: 0x7C3AED, // Purple
  botName: 'Outplayed',
};
