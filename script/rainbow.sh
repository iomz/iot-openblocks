#!/bin/bash

if [ ! -e '/var/local/rainbow.pid' ]; then
    echo $$ > /var/local/rainbow.pid
    while true; do for i in {1..7}; do echo -e "1000\n100\n$i" > /tmp/.runled; sleep 1; done done
else
    PID=`cat /var/local/rainbow.pid`
    rm /var/local/rainbow.pid
    kill $PID
    echo -e "1000\n1000\n6" > /tmp/.runled
fi
