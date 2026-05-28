# Scheduler image: Alpine + postgres client tools + busybox crond
FROM postgres:16-alpine

RUN apk add --no-cache bash gzip

COPY postgres-backup.sh /usr/local/bin/postgres-backup.sh
RUN chmod 0755 /usr/local/bin/postgres-backup.sh

COPY crontab /etc/crontabs/root

# -f foreground, -l log level
CMD ["crond", "-f", "-l", "2"]
