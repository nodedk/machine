# Config file

Each app has a app.json file in the application root:

```yml
server: 45.32.236.124
domains:
  - docs.com
  - www.docs.com
redirects:
  - /from-url: /to-url.html
```

# Vultr about server

```
curl http://169.254.169.254/v1.json | json_pp -json_opt pretty,canonical
```

### Install wildcard certificate

```
certbot certonly --manual -d '*.7i.no' --agree-tos --no-bootstrap --manual-public-ip-logging-ok --preferred-challenges dns-01 --no-eff-email --server https://acme-v02.api.letsencrypt.org/directory
```