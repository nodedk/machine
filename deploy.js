var fs = require('node:fs')
var tools = require('@nodedk/tools')
var nginx = require('./lib/nginx.js')
var util = require('./lib/util.js')

var mode = process.env.NODEDK_DEPLOY_ENV
var from = process.env.NODEDK_DEPLOY_BRANCH

var APPTYPES = { web: 'web', service: 'service', lib: 'lib' }

var repo = process.argv[2]
if (!repo) {
  tools.exit(`Repository URL is missing!`)
}
console.log(`Deploying repository ${repo}`)

// Extract name
var name = process.argv[3]
if (!name) {
  name = repo.split('/').reverse()[0]
}
name = name
  .trim()
  .replace(' ', '_')
  .toLowerCase()
  .replace(/\.git$/, '')

async function main() {
  process.chdir('/root')

  // Make sure /root/apps/docs/{data,log} exists or create it
  await tools.run(`mkdir -p apps/${name}/data`)
  await tools.run(`mkdir -p apps/${name}/log`)

  process.chdir(`/root/apps/${name}`)
  await tools.run(`rm -rf tmp`)
  var remote = from ? ` --branch ${from}` : ''
  await tools.run(`git clone ${repo} --depth 1${remote} tmp`)

  if (!(await tools.exist('tmp'))) {
    tools.exit(`Can't clone repo: ${repo}!`)
  }

  process.chdir(`tmp`)

  // Write mode to .env file
  if (mode) {
    await tools.write('.env', mode)
  }

  var revision = tools.get('git rev-parse --short HEAD')
  var branch = tools.get(`git rev-parse --abbrev-ref HEAD`)
  console.log(`Revision ${revision} on ${branch} branch`)

  // Fail if revision already exists
  if (await tools.exist(`/root/apps/${name}/${revision}`)) {
    tools.exit(
      'Revision already exists!\n\nPlease push an update and deploy again.\n'
    )
  }

  // Find nodedk config file
  var config = await tools.env('app.json', mode)

  console.log(`Using config:`)
  console.log(config)

  if (!config.domains || !config.domains.length) {
    tools.exit('Config domains field is missing!')
  }

  // Find package.json file
  if (!(await tools.exist(`package.json`))) {
    tools.exit('File package.json is missing!')
  }
  var pkg = await tools.read(`package.json`)

  // Allow simple domain setting
  if (typeof config.domains == 'string') {
    var { domains, redirects, ssl } = config
    config.domains = [{ names: domains, redirects, ssl }]
    delete config.redirects
    delete config.ssl
  }

  // Install packages
  console.log('Installing npm packages...')
  await tools.run(`npm i --omit=dev`)

  // Build
  if (pkg.scripts?.build) {
    console.log('Building app...')
    await tools.run(`npm run build`)
  }

  var {
    proxy,
    basicauth,
    ssr,
    sitemapdir,
    errordir,
    redirectmain,
    apptype = APPTYPES.web
  } = config

  if (!APPTYPES[apptype]) {
    tools.exit(`App type must be one of ${Object.keys(APPTYPES).join()}`)
  }

  var dist = `/root/apps/${name}/current/dist`
  var data = `/root/apps/${name}/data`

  if (apptype == APPTYPES.web) {
    // For each domain
    for (var domain of config.domains) {
      // Support string for domain
      if (typeof domain == 'string') {
        domain = { names: domain }
      }

      // Make sure nginx config for this app exists or create it
      // If create, also add Let's Encrypt certificate
      if (!domain.names) {
        tools.exit('Domain names field is missing!')
      }

      // Skip if it's an IP address, doesn't need nginx config
      if (tools.regexp.ip.test(domain.names)) {
        console.log('Found ip address, skipping...')
        continue
      }

      var names = domain.names.replace(/\s+/, ' ')
      var main = names.split(' ')[0]

      console.log(`Processsing ${main}...`)

      var certDir = main.replace(/\*\./g, '')
      var cert = domain.cert || `/etc/letsencrypt/live/${certDir}/fullchain.pem`
      var key = domain.key || `/etc/letsencrypt/live/${certDir}/privkey.pem`
      var ssl = domain.ssl !== false
      var dryRun = !!domain.dryRun
      var redirects = domain.redirects || []

      // Set up nginx config template
      var template = nginx({
        names,
        main,
        proxy,
        cert,
        key,
        dist,
        data,
        redirects,
        basicauth,
        ssr,
        sitemapdir,
        errordir,
        redirectmain
      })

      var nginxConf = util.nginxName(main, name)

      // Set up SSL certificate if it doesn't exist
      if (ssl && !(await tools.exist(cert))) {
        // Need plain http to validate domain
        await tools.write(nginxConf, template({ ssl: false }))
        await tools.run(`systemctl reload nginx`)

        var emailOption = config.email
          ? `--email ${config.email}`
          : `--register-unsafely-without-email`

        var domainOption = names
          .split(' ')
          .map((n) => `-d ${n}`)
          .join(' ')

        var certbotCommand = `certbot certonly --nginx --agree-tos --no-eff-email ${
          dryRun ? '--dry-run ' : ''
        }${emailOption} ${domainOption}`
        console.log(certbotCommand)

        // Install certificate
        await tools.run(certbotCommand)
      }

      // Write config based on preference
      await tools.write(nginxConf, template({ ssl }))
    }

    if (basicauth) {
      var [user, password] = basicauth.split(':')
      await tools.run(`htpasswd -b -c ${data}/.htpasswd ${user} ${password}`)
    }

    // Cron jobs
    var { jobs = [] } = config
    if (jobs.length) {
      var existing = await tools.run(`crontab -l`).stdout.trim().split('\n')
      var all = [...new Set(existing.concat(jobs))].join('\n')
      if (all) await tools.run(`echo "${all}" | crontab -`)
    }

    // Build sitemap
    if (config.sitemap && pkg.scripts?.sitemap) {
      await tools.run(`npm run sitemap`)
    }

    // Apply migrations
    if (pkg.scripts?.migrate) {
      await tools.run(`npm run migrate`)
    }
  }

  // Move stuff into place
  process.chdir(`/root/apps/${name}`)
  await tools.run(`mv tmp ${revision}`)

  // Record previous revision
  var prev = (await tools.exist('current')) ? fs.readlinkSync('current') : ''

  // Symlink to new revision
  await tools.run(`ln -sfn ${revision} current`)

  if (prev) {
    console.log(`Removing previous revision ${prev}`)
    await tools.run(`rm -rf ${prev}`)
  }

  if (apptype == APPTYPES.web) {
    // Reload services
    await tools.run(`systemctl daemon-reload`)

    // Restart nginx
    await tools.run(`systemctl reload nginx`)

    // Start app service if proxy
    if (proxy) {
      await tools.run(`systemctl enable app@${name}`)
      await tools.run(`systemctl restart app@${name}`)
    } else {
      await tools.run(`systemctl stop app@${name}`)
      await tools.run(`systemctl disable app@${name}`)
    }

    process.chdir(`/root/apps/${name}/current`)

    // Ping servers
    if (config.ping && pkg.scripts?.ping) {
      await tools.run(`npm run ping`)
    }
  }

  console.log('\nDeployed.\n')
  process.exit()
}

main()
