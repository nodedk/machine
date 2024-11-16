var _ = require('@nodedk/tools')

async function main() {
  await _.run(`git reset --hard`)
  await _.run(`git pull`)
  await _.run(`npm i`)
  await _.run(`apt-get update && apt-get upgrade -y`)
  await _.run(`npm i -g npm`)
  process.exit()
}
main()
