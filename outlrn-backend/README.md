<p align="center">
  <img  width="400" height="300"  alt="img2-removebg-preview" src="https://github.com/user-attachments/assets/1f2cc7f7-3727-4f0a-be82-35ca37402ece" />
</p>
<br>

# Outlrn Fast API

A FastAPI application managed with [UV](https://docs.astral.sh/uv/).

## Prerequisites

- Python 3.10+
- [UV](https://docs.astral.sh/uv/) package manager

## Setup

1. **Install dependencies:**

   ```bash
   uv sync
   ```

2. **Run the development server:**

   ```bash
   uv run fastapi dev main.py
   ```

   The server will start at `http://127.0.0.1:8000` with hot-reload enabled.

3. **Run in production mode:**

   ```bash
   uv run fastapi run main.py
   ```

## API Docs

Once the server is running, interactive API documentation is available at:

- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## Endpoints

| Method | Path      | Description         |
| ------ | --------- | ------------------- |
| GET    | `/`       | Welcome message     |
| GET    | `/health` | Health check        |

Lets Get Started!
- Understand the [Branching Strategy](./GithubBranchingStrategy.md) we follow, so that you can make your first contribution.
