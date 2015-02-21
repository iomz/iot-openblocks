#!/bin/bash

if [ ! -e '/var/local/rainbow.pid' ]; then
    echo $$ > /var/local/rainbow.pid
    while true; do for i in {1..7}; do echo -e "1000\n100\n$i" > /tmp/.runled; sleep 0.5; done done
elif [ -e '/var/local/iot.pid' ]; then
    PID=`cat /var/local/rainbow.pid`
    kill $PID
    echo -e "500\n250\n6" > /tmp/.runled
else
    rm -f /var/local/rainbow.pid
    echo -e "300\n5000\n2" > /tmp/.runled
fi

