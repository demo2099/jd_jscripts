#!/bin/sh

cd  /scripts/
git -C /scripts/ pull
echo "加载最新的定时任务文件..."
crontab /scripts/docker/crontab_list.sh
