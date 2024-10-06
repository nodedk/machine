var tools = require('extras')
var util = require('./lib/util.js')

var name = process.argv[2]

if (!name) {
  console.log(`\nName not found.\n`)
  console.log(`Usage:\n  node remove.js <name>\n`)
  process.exit()
}

console.log({ name })

var file = `/root/apps/${name}/current/nodedk.json`
if (!tools.exist(file)) {
  console.log(`Config file ${file} doesn't exist.`)
  process.exit()
}

var config = tools.env(`/root/apps/${name}/current/nodedk.json`)
console.log(config)

if (!config.domains) {
  console.log(`No domains found.`)
  process.exit()
}

let domains = []

function first(str) {
  return str.split(' ')[0]
}

if (typeof config.domains == 'string') {
  domains.push(first(config.domains))
} else {
  config.domains.forEach(function (d) {
    if (typeof d == 'string') {
      domains.push(first(d))
    } else if (d.names) {
      domains.push(first(d.names))
    }
  })
}

console.log({ domains })
if (!domains.length) {
  console.log(`No domains found.`)
  process.exit()
}

var service = `app@${name}`

// Stop service
tools.run(`systemctl stop ${service}`)

// Disable service
tools.run(`systemctl disable ${service}`)

var domain of domains) {
  // Remove nginx config
  var nginxConf = util.nginxName(domain, name)

  tools.run(`rm ${nginxConf}`)

  // Remove certificate
  tools.run(`certbot delete --non-interactive --cert-name ${domain}`)
}

// Delete app
tools.run(`rm -rf /root/apps/${name}`)
