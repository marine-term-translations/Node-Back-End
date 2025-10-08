FROM nginx

# Create the cache directory
RUN mkdir -p /path/to/cache && \
    chown -R nginx:nginx /path/to/cache

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-dev.vliz.be.conf /etc/nginx/conf.d/docker-dev.vliz.be.conf
