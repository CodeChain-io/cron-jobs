#!/usr/bin/env bash

if [[ -z "$SLACK" ]]; then
    echo "Slack notification is turned off";
    exit -1;
fi

yarn corgi 2>&1 | tee ./corgi.log