# Mozilla [Backstage](https://backstage.io) App

## Developing 

### Dependencies

Install and run Postgres from docker:

```sh
docker run -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:15
```

Set environment variables for postgres (or use `.env` file):

```sh
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=secret
```

To start the app, run:

```sh
yarn install
yarn dev
```

If using a `.env` file for the environment variables:

```sh
dotenv -- yarn dev
```