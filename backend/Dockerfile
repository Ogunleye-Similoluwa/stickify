# --- Build stage: server ---
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

# --- Build stage: WhatsApp bridge (only runs when WHATSAPP_MODE=linked) ---
FROM node:22-bookworm-slim AS bridge
WORKDIR /bridge
COPY bridge/package.json bridge/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY bridge/*.js ./

# --- Run stage: slim JRE plus ffmpeg and Node ---
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=bridge /usr/local/bin/node /usr/local/bin/node
RUN useradd --system --create-home stickify
WORKDIR /app
COPY --from=build /app/target/stickify-api.jar app.jar
COPY --from=bridge /bridge ./bridge
COPY start.sh ./start.sh
USER stickify
ENV JAVA_OPTS="-XX:MaxRAMPercentage=60"
EXPOSE 8080
ENTRYPOINT ["sh", "./start.sh"]
