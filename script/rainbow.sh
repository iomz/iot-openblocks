#!/bin/bash

if [ ! -e '/var/local/rainbow.pid' ]; then
    echo $$ > /var/local/rainbow.pid
    while true; do for i in {1..7}; do echo -e "250\n1\n$i" > /tmp/.runled; /bin/sleep 0.25; done done
elif [ -e '/var/local/iot.pid' ]; then
    kill `cat /var/local/rainbow.pid`
    echo -e "200\n200\n6" > /tmp/.runled
else
    kill `cat /var/local/rainbow.pid` > /dev/null 2>&1
    rm -f /var/local/rainbow.pid
    echo -e "300\n5000\n2" > /tmp/.runled
fi

