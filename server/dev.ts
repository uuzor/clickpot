// Runs the web app and the click tracker together.
const web = Bun.spawn(['bun', 'run', 'dev:web'], { stdio: ['inherit', 'inherit', 'inherit'] })
const api = Bun.spawn(['bun', 'run', 'server'], { stdio: ['inherit', 'inherit', 'inherit'] })

const stop = () => {
  api.kill()
  web.kill()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

await web.exited
api.kill()
