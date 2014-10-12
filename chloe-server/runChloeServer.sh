#!/bin/bash

#   Copyright (C) 2013-2014 Computer Sciences Corporation
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#       http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.


set -e

# TODO: Test is root

if [ ! -d /etc/sysconfig/ezbake/ ]; then
	sudo ln -s /opt/ezbake/conf/ /etc/sysconfig/ezbake
fi

# EZCONFIGURATION_DIR=/opt/ezbake/conf
export EZCONFIGURATION_DIR=/vagrant/node_apps/chloe/chloe-server/chloe-configuration
echo "EZCONFIGURATION_DIR = $EZCONFIGURATION_DIR"

if [ "$1" = "--debug" ]; then
	echo "Now starting Chloe server in debug mode..."
	node-debug -p 8081 chloe-server.js 
else
	echo "Now starting Chloe server in non-debug mode..."
	node chloe-server.js -c
fi
