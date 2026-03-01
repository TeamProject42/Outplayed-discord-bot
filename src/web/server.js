const express = require('express');
const { tournaments } = require('../database/db');
const { embedColor } = require('../config');
const logger = require('../utils/logger');

const app = express();
const PORT = 3000;

app.get('/tournament/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const tournament = tournaments.getByCode(code);

    if (!tournament) {
        return res.status(404).send(getErrorPage());
    }

    const regCount = tournaments.getRegistrationCount(tournament.id);
    res.send(getTournamentPage(tournament, regCount));
});

app.listen(PORT, () => {
    logger.info(`🌐 Tournament invite server running on http://localhost:${PORT}`);
});

function getTournamentPage(t, regCount) {
    const startDate = new Date(t.start_time).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.name} — Outplayed Tournament</title>
  <meta name="description" content="${t.name} — ${t.game} tournament on Outplayed. ${t.prize_pool ? 'Prize pool: ' + t.prize_pool : ''} Join now!">
  <meta property="og:title" content="${t.name} — Outplayed Tournament">
  <meta property="og:description" content="${t.game} • ${t.team_size}v${t.team_size} • ${t.format}${t.prize_pool ? ' • Prize: ' + t.prize_pool : ''}">
  <meta property="og:type" content="website">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0a0f;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: linear-gradient(145deg, #13131f, #1a1a2e);
      border: 1px solid rgba(124, 58, 237, 0.3);
      border-radius: 20px;
      padding: 40px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 0 60px rgba(124, 58, 237, 0.15);
    }
    .badge {
      display: inline-block;
      background: rgba(124, 58, 237, 0.2);
      color: #a78bfa;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 32px;
      font-weight: 900;
      background: linear-gradient(135deg, #7c3aed, #a78bfa, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .game {
      font-size: 16px;
      color: #94a3b8;
      margin-bottom: 28px;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat {
      background: rgba(255,255,255,0.03);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .stat-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .prize {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(168, 85, 247, 0.15));
      grid-column: span 2;
    }
    .prize .stat-value {
      color: #a78bfa;
      font-size: 24px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #7c3aed, #6d28d9);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      transition: all 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(124, 58, 237, 0.4);
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🏆 Tournament</div>
    <div class="title">${t.name}</div>
    <div class="game">🎮 ${t.game} • ${t.format.charAt(0).toUpperCase() + t.format.slice(1)}</div>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Team Size</div>
        <div class="stat-value">${t.team_size}v${t.team_size}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Teams</div>
        <div class="stat-value">${regCount} / ${t.max_teams}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Start Time</div>
        <div class="stat-value" style="font-size:14px">${startDate}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Status</div>
        <div class="stat-value">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</div>
      </div>
      ${t.prize_pool ? `<div class="stat prize"><div class="stat-label">💰 Prize Pool</div><div class="stat-value">${t.prize_pool}</div></div>` : ''}
    </div>
    <a class="btn" href="https://discord.gg/" target="_blank">Join Discord & Register</a>
    <div class="footer">Powered by Outplayed • ${t.tournament_code}</div>
  </div>
</body>
</html>`;
}

function getErrorPage() {
    return `<!DOCTYPE html>
<html><head><title>Tournament Not Found — Outplayed</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
  body{font-family:'Inter',sans-serif;background:#0a0a0f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:40px}
  h1{font-size:48px;margin-bottom:16px}
  p{color:#64748b;font-size:16px}
</style></head>
<body><div class="card"><h1>😕</h1><h2>Tournament Not Found</h2><p>This tournament link is invalid or has expired.</p></div></body></html>`;
}

module.exports = app;
