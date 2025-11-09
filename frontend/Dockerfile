# 使用 Caddy 官方 Alpine 镜像
FROM caddy:2-alpine

# 拷贝前端构建产物
COPY dist /usr/share/caddy

# 拷贝 Caddy 配置文件
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 3000

# 默认 ENTRYPOINT 就是 caddy run