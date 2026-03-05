# 🏆 Outplayed Esports Tournament Bot

The **Outplayed Discord Bot** is a comprehensive Discord application for managing esports tournaments directly within your server. Built with Node.js, discord.js, and Supabase, it provides end-to-end features for players to build profiles, form teams, register for tournaments, and submit match results.

## ✨ Features

- **🎮 Multi-Game Profiles:** Players can link their Valorant, BGMI, CS2, etc. identities to a single central account.
- **🛡️ Franchise & Team Management:** Users can create custom "Franchises", invite other Discord members, and build specific game rosters.
- **🎟️ Tournament Discovery & Registration:** Integrated discovery features where teams can browse open tournaments, view prize pools, and register straight from Discord.
- **⚔️ Match Automation:** Automated bracket displays, schedule pulling, and `/checkin` & `/submitresult` (with image proof support).
- **📊 Leaderboards & Stats:** Persistent matchmaking history allowing players to show off their win/loss ratios.

---

## 🛠️ Prerequisites

Before you can run the bot locally or deploy it, you will need the following accounts and tools:

1. **Node.js** (v18.0.0 or higher) - [Download Node.js](https://nodejs.org/)
2. **Discord Developer Account** - Create an application to get your Bot Token and Client ID.
3. **Supabase Account** - Create a free project on [Supabase.com](https://supabase.com/).

---

## 🚀 Initial Setup 

1. **Clone the Repository** and navigate to the project root:
   ```bash
   git clone <your-repo-url>
   cd Outplayed-discord-bot
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

---

## 🔐 Configuration & Environment Variables

You must configure the bot's environment variables so it can authenticate with Discord and Supabase. 

1. In the root directory, copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Open the newly created `.env` file and populate the secrets:
   - `DISCORD_TOKEN`: Your secret bot token from the Discord Developer Portal.
   - `CLIENT_ID`: Your Discord Application's Client ID.
   - `GUILD_ID`: The ID of your testing/development Discord Server (Enable Developer Mode in Discord settings to right-click and copy server IDs).
   - `SUPABASE_URL`: Your Supabase Project URL (Found in **Supabase Dashboard -> Settings -> API**).
   - `SUPABASE_KEY`: Your Supabase **`service_role`** key (Found in the same API settings page). **Do not use the standard `anon` key**, the bot requires the `service_role` key to bypass Row Level Security.

---

## 🗄️ Database Setup (Supabase)

The bot relies on a specific relational database layout to store users, teams, and tournament statuses.

1. Log into your Supabase Dashboard.
2. Select your project and go to the **SQL Editor** on the left-hand navigation bar.
3. Open the `schema.sql` (found locally at `src/database/schema.sql` if you retained a copy, or the schema referenced in your planning).
4. Run the SQL script to instantiate all tables: `User`, `Franchise`, `Tournament`, `Matches`, and all game-specific relation tables (`ValorantMember`, `BgmiMember`, etc.).

---

## 💻 Running the Bot

### 1. Register Slash Commands
Discord bots require slash commands to be explicitly pushed to the Discord API before they become visible to users. Run the deployment script:
```bash
npm run deploy
```
*You should see a success message indicating commands were registered.*

### 2. Start the Application
Start the bot using node:
```bash
npm start
```
*(Optionally, use `npm run dev` to start the bot with `nodemon`, which will automatically restart the bot when you save code changes).*

If successful, the console will output:
`✅ Outplayed bot is online! Logged in as [YourBotName]`

---

## 📚 General Commands Reference

Once the bot is online, users can type the following commands into the Discord server:

**Identity & Profiles**
- `/start` - Launch the onboarding process. Links the user's Discord ID to a new Supabase profile.
- `/profile [user]` - View your own or another user's multi-game profile.
- `/setbio` - Customize your profile biography.
- `/games` - Add, verify, update, or remove linked game IDs (e.g. adding a Valorant Riot ID).

**Team Management**
- `/createteam` - Create a new Franchise and become the Captain.
- `/jointeam` - Join a team via a unique Team Code.
- `/manageteam` - Leave your active team, view the team profile, or transfer ownership to someone else.
- `/myteam` - View the roster of your currently active team.

**Tournaments & Matches**
- `/tournaments` - Browse a list of all currently active tournaments. Interactive buttons allow immediate registration.
- `/bracket` - View the live bracket pairings of a specific tournament ID.
- `/checkin` - Confirm your team is present before a tournament begins.
- `/matches` - View upcoming match schedules for your registered teams.
- `/submitresult` - Report a match win by uploading an image screenshot for proof.
- `/stats` - View your global matchmaking statistics.

---

## 📁 Project Structure

\`\`\`
├── src/
│   ├── commands/        # All discord slash commands natively grouped by feature
│   │   ├── owner/       # Admin and moderation commands
│   │   ├── player/      # Profile, bio, and multi-game logic
│   │   ├── team/        # Franchise creation and roster management
│   │   └── tournament/  # Checks-ins, brackets, and match reporting
│   ├── constants/       # Globally shared string literals, IDs, and emojis
│   ├── database/        # Supabase client wrapper & abstractions (`supabase.js`)
│   ├── events/          # Core Discord event listeners (`ready.js`, `interactionCreate.js`)
│   ├── utils/           # Helper scripts for Match Brackets and Embed UI generation
│   ├── config.js        # Maps the `.env` variables into standard node exports
│   ├── deploy-commands.js # Script to pulse slash-commands to the Discord API
│   └── index.js         # Standard application entry point
├── .env                 # Secret keys (Ignored by Git)
├── package.json         # Dependencies & generic scripts
└── README.md            # You are here!
\`\`\`
