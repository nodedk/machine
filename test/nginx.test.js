var nginx = require('../lib/nginx.js')

var config = {
  proxy: 'http://localhost:5000',
  domains: [
    {
      names: 'entangle.no www.entangle.no',
      cert: '/etc/letsencrypt/live/entangle.no/fullchain.pem',
      key: '/etc/letsencrypt/live/entangle.no/privkey.pem',
      redirects: [
        '^/about.html$ http://example.com',
        '^/nils.html$ http://example.no'
      ]
    }
  ]
}

var name = 'hello'
var domain = config.domains[0]
var names = domain.names.replace(/\s+/, ' ')
var main = names.split(' ')[0]
var proxy = config.proxy || 'http://localhost:5000'
var cert = domain.cert || `/etc/letsencrypt/live/${main}/fullchain.pem`
var key = domain.key || `/etc/letsencrypt/live/${main}/privkey.pem`
var dist = `/root/apps/${name}/current/dist`
var redirects = domain.redirects || []

var template = nginx({
  names,
  main,
  proxy,
  cert,
  key,
  dist,
  redirects,
  ssr: true
})({ ssl: true })

console.log(template)
