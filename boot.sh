#!/bin/bash

apt-get update && apt-get -y install curl
curl https://raw.githubusercontent.com/nodedk/machine/master/install.sh | sh
