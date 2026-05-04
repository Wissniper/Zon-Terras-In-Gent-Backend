# Running the project with Docker

This is the recommended way to run the backend locally. Everything runs inside Ubuntu 22.04 containers so you don't need to install Node, MongoDB, LibreDWG, or Python on your own machine.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- That's it

---

## First-time setup

**1. Clone the repo and go into it**

**2. Create your `.env.docker` file**

Copy the example and adjust if needed (defaults work out of the box):

```bash
cp .env.example .env.docker
```

Then open `.env.docker` and change this one line:

```
MONGODB_URI=mongodb://mongo:27017/terras
```

That's the only required change — it points the app at the MongoDB container instead of localhost.

**3. Start everything**

```bash
docker compose up
```

The first run takes a while (10–20 min) because it compiles LibreDWG from source. Docker caches it after that, so future starts are instant.

When you see something like `Server running on port 3000`, you're good. The API is at `http://localhost:3000`.

---

## Daily use

```bash
# Start (logs stream to your terminal, Ctrl+C to stop)
docker compose up

# Start in the background (terminal stays free)
docker compose up -d

# Watch logs when running in background
docker compose logs -f

# Stop everything
docker compose down
```

MongoDB data persists between restarts in a Docker volume. `docker compose down` does **not** wipe it. To wipe it: `docker compose down -v`.

---

## Hot reload

The source code is mounted directly into the container, so any `.ts` file you save triggers nodemon to reload automatically — no rebuild needed.

---

## Running scripts inside the container

```bash
# Drop into a shell inside the app container
docker compose exec app bash

# Or run a script directly
docker compose exec app npm run pipeline:gent3d
docker compose exec app npm run seed:terrassen
docker compose exec app npm run export-rdf
```

---

## Verify the pipeline tools are installed

```bash
docker compose exec app dwg2dxf --version
docker compose exec app python3 -c "import ezdxf; print(ezdxf.__version__)"
docker compose exec app obj2gltf --version
```

---

## Common issues

**Port 3000 already in use**
You probably have the API running locally too. Stop the local server first, or change the port in `docker-compose.yml` (`"3001:3000"` maps container port 3000 to your host port 3001).

**`docker compose up` fails immediately on the app service**
Make sure `.env.docker` exists and has `MONGODB_URI=mongodb://mongo:27017/terras`. The app waits for MongoDB to be healthy before starting, so if the env file is missing it crashes early.

**Changes to `package.json` or `Dockerfile.dev` not picked up**
You need to rebuild the image:
```bash
docker compose up --build
```

**Want a clean slate**
```bash
docker compose down -v   # stops containers and deletes volumes (wipes DB)
docker compose up --build
```
