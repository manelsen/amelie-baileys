clear && while true; do printf "\rMemória do Chrome: %.2f MB" $(ps -e -o rss,command | awk '/chrome/ {mem += $1} END {print mem/1024}'); sleep 1; done
