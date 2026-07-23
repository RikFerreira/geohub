# geohub

Serviço HTTP com a API de geoprocessamento, publicado em
`https://geohub.rikalves.com`.

## Desenvolvimento local

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

A página abre em `http://localhost:8000`, o Swagger em `/docs`.

## Imagem

```bash
docker build -t geohub .
docker run --rm -p 8000:8000 geohub
```

## Publicação

Push na `main` dispara o workflow, que publica em `ghcr.io/rikferreira/geohub`.
A stack de produção vive no repositório `webgis` e consome essa imagem.

## Variáveis de ambiente

| Variável      | Default  | Descrição                                          |
| ------------- | -------- | -------------------------------------------------- |
| `APP_NAME`    | `geohub` | Título exibido na documentação da API.             |
| `APP_VERSION` | `dev`    | Versão informada em `/health` e no OpenAPI.        |

## Como adicionar um endpoint

1. A lógica vai em `app/services/<nome>.py`, como função que recebe e devolve
   tipos Python. Não importa FastAPI.
2. A camada HTTP vai em `app/routers/<nome>.py`: um `APIRouter` com
   `prefix="/api/v1/<nome>"`, os modelos Pydantic de entrada e saída, e a rota
   que chama o service.
3. Registre com `app.include_router(<nome>.router)` em `app/main.py`.

A separação existe para que a lógica seja testável e reutilizável sem HTTP.
