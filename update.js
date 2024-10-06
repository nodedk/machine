var tools = require('extras')

tools.run(`git reset --hard`)
tools.run(`git pull`)
tools.run(`npm i`)
tools.run(`apt-get update && apt-get upgrade -y`)
tools.run(`npm i -g npm`)
