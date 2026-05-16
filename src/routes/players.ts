import { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client'

const players: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { name: string } }>('/players', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const result = await db
      .insertInto('players')
      .values({ name: req.body.name })
      .executeTakeFirstOrThrow()

    const player = await db
      .selectFrom('players')
      .where('id', '=', Number(result.insertId))
      .selectAll()
      .executeTakeFirstOrThrow()

    return reply.status(201).send(player)
  })

  fastify.get('/players', async (_req, reply) => {
    const rows = await db.selectFrom('players').selectAll().orderBy('name', 'asc').execute()
    return reply.send(rows)
  })
}

export default players
