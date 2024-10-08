# Machine

Contains a boot script to install all the software needed to run NodeDK apps.

Includes:

* NodeJS LTS
* NGINX loadbalancer with HTTP2
* Automatic Certbot Let's Encrypt SSL
* Public Key authentication
* Firewall (UFW)

### Configuration

You can customize your install by exporting the following variables before you run the install:
```sh
# Set the git name
export GIT_CONFIG_NAME="Your name"

# Set the git email
export GIT_CONFIG_EMAIL="your@git.email"
```

### Install

Create a server on for example [Vultr VPS](https://vultr.com). Add your SSH key there so you can ssh to it without a password.

Choose Ubuntu 22.04 as operating system. Enable private networking if you need the machine to be connected to from other machines.

Once it's running, log in to your server via SSH (`ssh root@ip-address`) and run this command:
```sh
curl https://raw.githubusercontent.com/nodedk/machine/master/install.sh | sh
```

### Wildcard domains

Installation of wildcard domains can be done manually like this:

```
certbot certonly --manual --preferred-challenges=dns --agree-tos --no-eff-email --register-unsafely-without-email -d "example.com" -d "*.example.com"
```

Created by [Eldøy Tech AS](https://eldoy.com)
