import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'

async function enrichState(gameId: number) {
  const s = await db
    .selectFrom('game_state')
    .where('game_id', '=', gameId)
    .selectAll()
    .executeTakeFirst()

  if (!s) return null

  const lookupPlayer = async (id: number | null) => {
    if (id === null) return null
    return db.selectFrom('players').where('id', '=', id).select(['id', 'name']).executeTakeFirst() ?? null
  }

  const [first, second, third] = await Promise.all([
    lookupPlayer(s.first_base),
    lookupPlayer(s.second_base),
    lookupPlayer(s.third_base),
  ])

  return {
    outs: s.outs,
    inning: s.current_inning,
    half: s.current_half,
    first: first ?? null,
    second: second ?? null,
    third: third ?? null,
  }
}

const games: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { label?: string } }>('/games', {
    schema: {
      body: {
        type: 'object',
        properties: {
          label: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const label = (req.body as { label?: string })?.label ?? null

    let gameId = 0
    await db.transaction().execute(async (trx) => {
      const result = await trx
        .insertInto('games')
        .values({ label, completed_at: null })
        .executeTakeFirstOrThrow()

      gameId = Number(result.insertId)

      await trx
        .insertInto('game_state')
        .values({
          game_id: gameId,
          outs: 0,
          first_base: null,
          second_base: null,
          third_base: null,
          current_inning: 1,
          current_half: 'top',
        })
        .execute()
    })

    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirstOrThrow()
    return reply.status(201).send({ game, state: await enrichState(gameId) })
  })

  fastify.get('/games', async (_req, reply) => {
    const rows = await db.selectFrom('games').selectAll().orderBy('created_at', 'desc').execute()
    return reply.send(rows)
  })

  fastify.get<{ Params: { id: string } }>('/games/:id', async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })

    const players = await db
      .selectFrom('game_players as gp')
      .innerJoin('players as p', 'p.id', 'gp.player_id')
      .where('gp.game_id', '=', gameId)
      .select(['p.id', 'p.name'])
      .execute()

    return reply.send({ game, players, state: await enrichState(gameId) })
  })

  fastify.patch<{ Params: { id: string }; Body: { label: string } }>('/games/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })

    const label = req.body.label.trim() || null
    await db.updateTable('games').set({ label }).where('id', '=', gameId).execute()

    const updated = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirstOrThrow()
    return reply.send(updated)
  })

  fastify.post<{ Params: { id: string }; Body: { playerId: number } }>('/games/:id/players', {
    schema: {
      body: {
        type: 'object',
        required: ['playerId'],
        properties: {
          playerId: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const { playerId } = req.body

    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })
    if (game.completed_at) return reply.status(400).send({ error: 'Game is already completed' })

    const player = await db.selectFrom('players').where('id', '=', playerId).selectAll().executeTakeFirst()
    if (!player) return reply.status(404).send({ error: 'Player not found' })

    const existing = await db
      .selectFrom('game_players')
      .where('game_id', '=', gameId)
      .where('player_id', '=', playerId)
      .selectAll()
      .executeTakeFirst()

    if (existing) return reply.status(409).send({ error: 'Player is already in this game' })

    await db.insertInto('game_players').values({ game_id: gameId, player_id: playerId }).execute()

    return reply.status(201).send({ gameId, player })
  })

  fastify.post<{ Params: { id: string } }>('/games/:id/complete', async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })
    if (game.completed_at) return reply.status(400).send({ error: 'Game is already completed' })

    await db
      .updateTable('games')
      .set({ completed_at: new Date().toISOString() })
      .where('id', '=', gameId)
      .execute()

    const updated = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirstOrThrow()
    return reply.send(updated)
  })
}

export default games
