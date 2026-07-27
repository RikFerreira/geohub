# geohub

Monólito de extração de rede: um formulário no navegador (`frontend/`) lê o
modelo Bentley (SQLite), reconstrói a geometria e envia GeoJSON para a API
(`backend/`), que faz o resto do trabalho. Publicado em
`https://geohub.rikalves.com`.

## Arquitetura

```
frontend/   formulário estático (HTML + JS puro, sql.js). Extrai as estruturas
            do modelo e monta o payload GeoJSON. Servido em /.
backend/    API FastAPI. Recebe o payload, valida com Pydantic e publica.
```

O frontend reconstrói a geometria no cliente; o backend não mexe em coordenadas.

## Contrato do payload

`POST /api/v1/build_network` recebe:

```json
{
  "IdMun": "<geocodigo>",
  "TipoRede": "SAA | SES",
  "IdAlt": "0",
  "scenarioId": 1,
  "SAA": { "<estrutura>": { "type": "FeatureCollection", "features": [] } },
  "SES": {}
}
```

Só a rede indicada por `TipoRede` vem preenchida; a outra fica vazia. Cada
estrutura (`rel`, `eea`, `rede`, ...) traz suas features. Modelos em
`backend/models.py`.

A resposta é um zip (`application/zip`) com dois shapefiles: `sab_estruturas_p`
(pontos) e `sab_estruturas_l` (linhas). Cada feição carrega os campos
`geocodigo`, `tipo_rede`, `alt`, `estrutura` e `label`. As coordenadas passam
como recebidas (UTM, em metros).

## Desenvolvimento local

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

O formulário abre em `http://localhost:8000`, o Swagger em `/docs`.

## Imagem

```bash
docker build -t geohub .
docker run --rm -p 8000:8000 geohub
```

## Publicação

Push na `main` dispara o workflow, que publica em `ghcr.io/rikferreira/geohub`.
A stack de produção vive no repositório `webgis` e consome essa imagem.

## Variáveis de ambiente

| Variável              | Default  | Descrição                                            |
| --------------------- | -------- | ---------------------------------------------------- |
| `APP_NAME`            | `geohub` | Título exibido na documentação da API.               |
| `APP_VERSION`         | `dev`    | Versão informada em `/health` e no OpenAPI.          |
| `OPENFLOWS_API_TOKEN` | (vazio)  | Segredo enviado no header `X-API-Token`. Vazio = sem checagem. |

## Pontos em aberto

- Os shapefiles saem **sem `.prj`** (CRS indefinido). Para gravar a projeção é
  preciso o mapa geocodigo → EPSG UTM (existe no histórico do git, em
  `app/data/utmzones_municipality.csv`).
- `estrutura` guarda a chave crua (`eee`, `rel`, ...). O nome legível (`tipo_est`)
  e os rótulos de `tipo_rede`/`alternativa` ainda não são resolvidos.
- O token do frontend está fixo em `frontend/extract.js` (`API_TOKEN`); precisa
  bater com `OPENFLOWS_API_TOKEN` no backend.
