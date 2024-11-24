var fs = require('node:fs')
var _ = require('@nodedk/tools')
var nginx = require('./lib/nginx.js')
var util = require('./lib/util.js')

var mode = process.env.NODEDK_DEPLOY_ENV
var from = process.env.NODEDK_DEPLOY_BRANCH

var APPTYPES = { web: 'web', service: 'service', lib: 'lib' }

var repo = process.argv[2]
if (!repo) {
  _.exit(`Repository URL is missing!`)
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
  await _.run(`mkdir -p apps/${name}/data`)
  await _.run(`mkdir -p apps/${name}/log`)

  process.chdir(`/root/apps/${name}`)
  await _.run(`rm -rf tmp`)
  var remote = from ? ` --branch ${from}` : ''
  await _.run(`git clone ${repo} --depth 1${remote} tmp`)

  if (!(await _.exist('tmp'))) {
    _.exit(`Can't clone repo: ${repo}!`)
  }

  process.chdir(`tmp`)

  // Write mode to .env file
  if (mode) {
    await _.write('.env', mode)
  }

  var revision = _.get('git rev-parse --short HEAD')
  var branch = _.get(`git rev-parse --abbrev-ref HEAD`)
  console.log(`Revision ${revision} on ${branch} branch`)

  // Fail if revision already exists
  if (await _.exist(`/root/apps/${name}/${revision}`)) {
    _.exit(
      'Revision already exists!\n\nPlease push an update and deploy again.\n'
    )
  }

  // Find nodedk config file
  var config = await _.env('app.json', mode)

  console.log(`Using config:`)
  console.log(config)

  if (!config.domains || !config.domains.length) {
    _.exit('Config domains field is missing!')
  }

  // Find package.json file
  if (!(await _.exist(`package.json`))) {
    _.exit('File package.json is missing!')
  }
  var pkg = await _.read(`package.json`)

  // Allow simple domain setting
  if (typeof config.domains == 'string') {
    var { domains, redirects, ssl } = config
    config.domains = [{ names: domains, redirects, ssl }]
    delete config.redirects
    delete config.ssl
  }

  // Install packages
  console.log('Installing npm packages...')
  await _.run(`npm i --omit=dev`)

  // Build
  if (pkg.scripts?.build) {
    console.log('Building app...')
    await _.run(`npm run build`)
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
    _.exit(`App type must be one of ${Object.keys(APPTYPES).join()}`)
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
        _.exit('Domain names field is missing!')
      }

      // Skip if it's an IP address, doesn't need nginx config
      if (_.regexp.ip.test(domain.names)) {
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
      if (ssl && !(await _.exist(cert))) {
        // Need plain http to validate domain
        await _.write(nginxConf, template({ ssl: false }))
        await _.run(`systemctl restart nginx`)

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
        await _.run(certbotCommand)
      }

      // Write config based on preference
      await _.write(nginxConf, template({ ssl }))
    }

    if (basicauth) {
      var [user, password] = basicauth.split(':')
      await _.run(`htpasswd -b -c ${data}/.htpasswd ${user} ${password}`)
    }

    // Cron jobs
    var { jobs = [] } = config
    if (jobs.length) {
      var existing = await _.run(`crontab -l`).stdout.trim().split('\n')
      var all = [...new Set(existing.concat(jobs))].join('\n')
      if (all) await _.run(`echo "${all}" | crontab -`)
    }

    // Build sitemap
    if (config.sitemap && pkg.scripts?.sitemap) {
      await _.run(`npm run sitemap`)
    }

    // Apply migrations
    if (pkg.scripts?.migrate) {
      await _.run(`npm run migrate`)
    }
  }

  // Move stuff into place
  process.chdir(`/root/apps/${name}`)
  await _.run(`mv tmp ${revision}`)

  // Record previous revision
  var prev = (await _.exist('current')) ? fs.readlinkSync('current') : ''

  // Symlink to new revision
  await _.run(`ln -sfn ${revision} current`)

  if (prev) {
    console.log(`Removing previous revision ${prev}`)
    await _.run(`rm -rf ${prev}`)
  }

  if (apptype == APPTYPES.web) {
    // Reload services
    await _.run(`systemctl daemon-reload`)

    // Restart nginx
    await _.run(`systemctl restart nginx`)

    // Start app service if proxy
    if (proxy) {
      await _.run(`systemctl enable app@${name}`)
      await _.run(`systemctl restart app@${name}`)
    } else {
      await _.run(`systemctl stop app@${name}`)
      await _.run(`systemctl disable app@${name}`)
    }

    process.chdir(`/root/apps/${name}/current`)

    // Ping servers
    if (config.ping && pkg.scripts?.ping) {
      await _.run(`npm run ping`)
    }
  }

  console.log('\nDeployed.\n')
  process.exit()
}

main()
