#!/bin/bash

apt-get update && apt-get -y install curl
curl https://raw.githubusercontent.com/nodedk/host/master/install.sh | sh
