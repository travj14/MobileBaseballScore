import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'

type PaRow = { outcome: string }

function batterStats(pas: PaRow[]) {
  const pa = pas.length
  const h = pas.filter((p) => ['1B', '2B', '3B', 'HR'].includes(p.outcome)).length
  const singles = pas.filter((p) => p.outcome === '1B').length
  const doubles = pas.filter((p) => p.outcome === '2B').length
  const triples = pas.filter((p) => p.outcome === '3B').length
  const hr = pas.filter((p) => p.outcome === 'HR').length
  const bb = pas.filter((p) => p.outcome === 'BB').length
  const hbp = pas.filter((p) => p.outcome === 'HBP').length
  const k = pas.filter((p) => p.outcome === 'K').length
  const go = pas.filter((p) => p.outcome === 'GO').length
  const po = pas.filter((p) => p.outcome === 'PO').length
  const ab = pa - bb - hbp
  const tb = singles + doubles * 2 + triples * 3 + hr * 4
  return {
    pa, ab, h, singles, doubles, triples, hr, bb, hbp, k, go, po,
    avg: ab > 0 ? +(h / ab).toFixed(3) : 0,
    slg: ab > 0 ? +(tb / ab).toFixed(3) : 0,
    obp: pa > 0 ? +((h + bb + hbp) / pa).toFixed(3) : 0,
  }
}

function pitcherStats(pas: PaRow[]) {
  const bf = pas.length
  const h = pas.filter((p) => ['1B', '2B', '3B', 'HR'].includes(p.outcome)).length
  const bb = pas.filter((p) => p.outcome === 'BB').length
  const hbp = pas.filter((p) => p.outcome === 'HBP').length
  const k = pas.filter((p) => p.outcome === 'K').length
  const hr = pas.filter((p) => p.outcome === 'HR').length
  const go = pas.filter((p) => p.outcome === 'GO').length
  const po = pas.filter((p) => p.outcome === 'PO').length
  return { bf, h, bb, hbp, k, hr, go, po }
}

const stats: FastifyPluginAsync = async (fastify) => {
  // Career stats for a batter
  fastify.get<{ Params: { id: string } }>('/stats/batter/:id', async (req, reply) => {
    const batterId = parseInt(req.params.id)
    const player = await db.selectFrom('players').where('id', '=', batterId).selectAll().executeTakeFirst()
    if (!player) return reply.status(404).send({ error: 'Player not found' })

    const pas = await db
      .selectFrom('plate_appearances')
      .where('batter_id', '=', batterId)
      .select('outcome')
      .execute()

    const runs = await db
      .selectFrom('runs_scored')
      .where('scorer_id', '=', batterId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirst()

    return reply.send({
      player,
      batting: batterStats(pas),
      runs: Number(runs?.count ?? 0),
    })
  })

  // Career stats for a pitcher
  fastify.get<{ Params: { id: string } }>('/stats/pitcher/:id', async (req, reply) => {
    const pitcherId = parseInt(req.params.id)
    const player = await db.selectFrom('players').where('id', '=', pitcherId).selectAll().executeTakeFirst()
    if (!player) return reply.status(404).send({ error: 'Player not found' })

    const pas = await db
      .selectFrom('plate_appearances')
      .where('pitcher_id', '=', pitcherId)
      .select('outcome')
      .execute()

    const runsAllowed = await db
      .selectFrom('runs_scored as rs')
      .innerJoin('plate_appearances as pa', 'pa.id', 'rs.driven_in_by_pa_id')
      .where('pa.pitcher_id', '=', pitcherId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirst()

    return reply.send({
      player,
      pitching: pitcherStats(pas),
      runsAllowed: Number(runsAllowed?.count ?? 0),
    })
  })

  // Batter vs pitcher matchup
  fastify.get<{ Querystring: { batter: string; pitcher: string } }>('/stats/matchup', {
    schema: {
      querystring: {
        type: 'object',
        required: ['batter', 'pitcher'],
        properties: {
          batter: { type: 'string' },
          pitcher: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const batterId = parseInt(req.query.batter)
    const pitcherId = parseInt(req.query.pitcher)

    const [batter, pitcher] = await Promise.all([
      db.selectFrom('players').where('id', '=', batterId).selectAll().executeTakeFirst(),
      db.selectFrom('players').where('id', '=', pitcherId).selectAll().executeTakeFirst(),
    ])

    if (!batter) return reply.status(404).send({ error: 'Batter not found' })
    if (!pitcher) return reply.status(404).send({ error: 'Pitcher not found' })

    const pas = await db
      .selectFrom('plate_appearances')
      .where('batter_id', '=', batterId)
      .where('pitcher_id', '=', pitcherId)
      .selectAll()
      .execute()

    const runs = await db
      .selectFrom('runs_scored as rs')
      .innerJoin('plate_appearances as pa', 'pa.id', 'rs.driven_in_by_pa_id')
      .where('rs.scorer_id', '=', batterId)
      .where('pa.pitcher_id', '=', pitcherId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirst()

    return reply.send({
      batter,
      pitcher,
      batting: batterStats(pas),
      runs: Number(runs?.count ?? 0),
      log: pas,
    })
  })

  // Per-player stat lines for a game
  fastify.get<{ Params: { id: string } }>('/stats/game/:id', async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })

    const players = await db
      .selectFrom('game_players as gp')
      .innerJoin('players as p', 'p.id', 'gp.player_id')
      .where('gp.game_id', '=', gameId)
      .select(['p.id', 'p.name'])
      .execute()

    const allPas = await db
      .selectFrom('plate_appearances')
      .where('game_id', '=', gameId)
      .selectAll()
      .execute()

    const allRuns = await db
      .selectFrom('runs_scored')
      .where('game_id', '=', gameId)
      .selectAll()
      .execute()

    const lines = players.map((player) => {
      const batterPas = allPas.filter((p) => p.batter_id === player.id)
      const pitcherPas = allPas.filter((p) => p.pitcher_id === player.id)
      const runsCount = allRuns.filter((r) => r.scorer_id === player.id).length

      return {
        player,
        batting: batterStats(batterPas),
        pitching: pitcherStats(pitcherPas),
        runs: runsCount,
      }
    })

    // Sort by runs scored desc, then avg desc
    lines.sort((a, b) => b.runs - a.runs || b.batting.avg - a.batting.avg)

    return reply.send({ game, players: lines })
  })
}

export default stats
