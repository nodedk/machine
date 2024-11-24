var _ = require('@nodedk/tools')
var util = require('./lib/util.js')

var name = process.argv[2]

async function main() {
  if (!name) {
    console.log(`\nName not found.\n`)
    console.log(`Usage:\n  node remove.js <name>\n`)
    process.exit()
  }

  console.log({ name })

  var file = `/root/apps/${name}/current/app.json`
  if (!(await _.exist(file))) {
    console.log(`Config file ${file} doesn't exist.`)
    process.exit()
  }

  var config = await _.env(`/root/apps/${name}/current/app.json`)
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
  await _.run(`systemctl stop ${service}`)

  // Disable service
  await _.run(`systemctl disable ${service}`)

  for (var domain of domains) {
    // Remove nginx config
    var nginxConf = util.nginxName(domain, name)

    await _.run(`rm ${nginxConf}`)

    // Remove certificate
    await _.run(`certbot delete --non-interactive --cert-name ${domain}`)
  }

  // Delete app
  await _.run(`rm -rf /root/apps/${name}`)

  process.exit()
}

main()
