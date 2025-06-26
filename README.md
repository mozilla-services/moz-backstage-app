# Mozilla [Backstage](https://backstage.io) App

## Developing

### Dependencies

Run postgres & redis backends with docker-compose:

```sh
docker compose up
```

> `docker-compose.yaml` defines volumes for postgres & redis to persist data for as long as the compose stack isn't destroyed.

Set environment variables for postgres (or use `.env` file):

```sh
cp .env.sample .env

export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=secret
```

To start the app, run:

```sh
nvm use
yarn install
yarn start
```

If using a `.env` file for the environment variables:

```sh
npm install -g dotenv-cli (if you don't have dotenv installed already)
dotenv -- yarn dev
```
