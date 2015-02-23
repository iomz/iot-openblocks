#!/bin/bash

if [ ! -e '/tmp/rainbow.pid' ]; then
    echo $$ > /tmp/rainbow.pid
    while true; do for i in {1..7}; do echo -e "250\n1\n$i" > /tmp/.runled; /bin/sleep 0.25; done done
elif [ -e '/tmp/iot.pid' ]; then
    kill `cat /tmp/rainbow.pid`
    echo -e "200\n200\n6" > /tmp/.runled
else
    kill `cat /tmp/rainbow.pid` > /dev/null 2>&1
    rm -f /tmp/rainbow.pid
    echo -e "300\n5000\n2" > /tmp/.runled
fi

