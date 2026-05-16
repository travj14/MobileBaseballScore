import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'
import { applyOutcome, LiveState } from '../logic/baseState'
import { OUTCOMES, Outcome, Half } from '../types'

const pa: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: string }
    Body: { batterId: number; pitcherId: number; inning: number; inningHalf: Half; outcome: Outcome }
  }>('/games/:id/pa', {
    schema: {
      body: {
        type: 'object',
        required: ['batterId', 'pitcherId', 'inning', 'inningHalf', 'outcome'],
        properties: {
          batterId: { type: 'number' },
          pitcherId: { type: 'number' },
          inning: { type: 'number', minimum: 1 },
          inningHalf: { type: 'string', enum: ['top', 'bottom'] },
          outcome: { type: 'string', enum: OUTCOMES },
        },
      },
    },
  }, async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const { batterId, pitcherId, inning, inningHalf, outcome } = req.body

    if (batterId === pitcherId) {
      return reply.status(400).send({ error: 'Batter and pitcher cannot be the same player' })
    }

    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })
    if (game.completed_at) return reply.status(400).send({ error: 'Game is already completed' })

    const roster = await db
      .selectFrom('game_players')
      .where('game_id', '=', gameId)
      .select('player_id')
      .execute()

    const playerIds = roster.map((r) => r.player_id)
    if (!playerIds.includes(batterId)) return reply.status(400).send({ error: 'Batter is not in this game' })
    if (!playerIds.includes(pitcherId)) return reply.status(400).send({ error: 'Pitcher is not in this game' })

    const stateRow = await db
      .selectFrom('game_state')
      .where('game_id', '=', gameId)
      .selectAll()
      .executeTakeFirstOrThrow()

    let liveState: LiveState = {
      outs: stateRow.outs,
      first: stateRow.first_base,
      second: stateRow.second_base,
      third: stateRow.third_base,
      inning: stateRow.current_inning,
      half: stateRow.current_half,
    }

    // New inning half — reset base state
    if (inning !== liveState.inning || inningHalf !== liveState.half) {
      liveState = { outs: 0, first: null, second: null, third: null, inning, half: inningHalf }
    }

    const { state: newState, runsScored } = applyOutcome(liveState, batterId, outcome)

    let paId = 0
    await db.transaction().execute(async (trx) => {
      const paResult = await trx
        .insertInto('plate_appearances')
        .values({ game_id: gameId, batter_id: batterId, pitcher_id: pitcherId, inning, inning_half: inningHalf, outcome })
        .executeTakeFirstOrThrow()

      paId = Number(paResult.insertId)

      for (const scorerId of runsScored) {
        await trx
          .insertInto('runs_scored')
          .values({ game_id: gameId, scorer_id: scorerId, driven_in_by_pa_id: paId })
          .execute()
      }

      await trx
        .updateTable('game_state')
        .set({
          outs: newState.outs,
          first_base: newState.first,
          second_base: newState.second,
          third_base: newState.third,
          current_inning: newState.inning,
          current_half: newState.half,
        })
        .where('game_id', '=', gameId)
        .execute()
    })

    const recorded = await db
      .selectFrom('plate_appearances')
      .where('id', '=', paId)
      .selectAll()
      .executeTakeFirstOrThrow()

    const lookupPlayer = async (id: number | null) => {
      if (id === null) return null
      return db.selectFrom('players').where('id', '=', id).select(['id', 'name']).executeTakeFirst() ?? null
    }

    const [firstP, secondP, thirdP] = await Promise.all([
      lookupPlayer(newState.first),
      lookupPlayer(newState.second),
      lookupPlayer(newState.third),
    ])

    const scoredPlayers = await Promise.all(
      runsScored.map((id) => db.selectFrom('players').where('id', '=', id).select(['id', 'name']).executeTakeFirst())
    )

    return reply.status(201).send({
      pa: recorded,
      gameState: {
        outs: newState.outs,
        inning: newState.inning,
        half: newState.half,
        first: firstP ?? null,
        second: secondP ?? null,
        third: thirdP ?? null,
      },
      runsScored: scoredPlayers.filter(Boolean),
    })
  })

  fastify.get<{ Params: { id: string } }>('/games/:id/pa', async (req, reply) => {
    const gameId = parseInt(req.params.id)
    const game = await db.selectFrom('games').where('id', '=', gameId).selectAll().executeTakeFirst()
    if (!game) return reply.status(404).send({ error: 'Game not found' })

    const rows = await db
      .selectFrom('plate_appearances as pa')
      .innerJoin('players as b', 'b.id', 'pa.batter_id')
      .innerJoin('players as p', 'p.id', 'pa.pitcher_id')
      .where('pa.game_id', '=', gameId)
      .orderBy('pa.created_at', 'asc')
      .select([
        'pa.id', 'pa.game_id', 'pa.inning', 'pa.inning_half', 'pa.outcome', 'pa.created_at',
        'b.id as batter_id', 'b.name as batter_name',
        'p.id as pitcher_id', 'p.name as pitcher_name',
      ])
      .execute()

    return reply.send(rows)
  })
}

export default pa
