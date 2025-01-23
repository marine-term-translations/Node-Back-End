FROM nginx

COPY docker-dev.vliz.be.cnf docker-dev.vliz.be.cnf
COPY issuer.cnf issuer.cnf

RUN openssl req -x509 -nodes -days 5 \
    -newkey rsa:2048 \
    -keyout /etc/ssl/private/www.docker-dev.vliz.be.key \
    -out /etc/ssl/certs/www.docker-dev.vliz.be.crt \
    -config docker-dev.vliz.be.cnf

RUN openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout /etc/ssl/private/issuer.key \
    -out /etc/ssl/certs/issuer.crt \
    -config issuer.cnf

# This takes a while to run:
# RUN openssl dhparam -out /etc/nginx/dhparam.pem 4096

# Create the cache directory
RUN mkdir -p /path/to/cache && \
    chown -R nginx:nginx /path/to/cache

COPY nginx.conf /etc/nginx/conf.d/docker-dev.vliz.be.conf
