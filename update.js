var tools = require('@nodedk/tools')

async function main() {
  await tools.run(`git reset --hard`)
  await tools.run(`git pull`)
  await tools.run(`npm i`)
  await tools.run(`apt-get update && apt-get upgrade -y`)
  await tools.run(`npm i -g npm`)
  process.exit()
}
main()
