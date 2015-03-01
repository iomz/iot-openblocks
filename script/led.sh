#!/bin/bash

state=$1

if [ -e '/tmp/led.pid' ]; then
    kill `cat /tmp/led.pid` > /dev/null 2>&1
    rm -f /tmp/led.pid
fi

if [[ $state == 'discovering' ]]; then
    echo $$ > /tmp/led.pid
    while true; do
        for i in {1..7}; do
            echo -e "250\n1\n$i" > /tmp/.runled;
            /bin/sleep 0.25;
        done
    done
elif [[ $state == 'initializing' ]]; then
    echo -e "100\n100\n6" > /tmp/.runled
elif [[ $state == 'initialized' ]]; then
    echo -e "200\n200\n2" > /tmp/.runled
elif [[ $state == 'down' ]]; then
    echo -e "200\n200\n1" > /tmp/.runled
else
    echo -e "300\n5000\n2" > /tmp/.runled
fi

