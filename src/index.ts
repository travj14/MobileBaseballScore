import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import { resolve } from 'path'
import { migrate } from './db/migrate'
import players from './routes/players'
import games from './routes/games'
import pa from './routes/pa'
import stats from './routes/stats'

const PORT = parseInt(process.env.PORT ?? '1402')

async function main() {
  migrate()

  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

  await app.register(cors, { origin: true })
  await app.register(sensible)
  await app.register(fastifyStatic, {
    root: resolve(process.cwd(), 'public'),
    prefix: '/',
    decorateReply: false,
  })

  await app.register(players, { prefix: '/api/v1' })
  await app.register(games, { prefix: '/api/v1' })
  await app.register(pa, { prefix: '/api/v1' })
  await app.register(stats, { prefix: '/api/v1' })

  app.get('/health', async () => ({ ok: true }))

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`Baseball tracker running on port ${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
