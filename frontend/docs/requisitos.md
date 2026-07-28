# Requisitos do modelo — WaterGEMS (SAA) e SewerGEMS (SES)

Para a ferramenta reconhecer as estruturas e gerar a saída no padrão do projeto,
cada elemento precisa de **campos definidos pelo usuário** (User Data Extensions)
criados e preenchidos no modelo. O rótulo (Label) **não** é usado para classificar.

Campos marcados com **(novo)** ainda não existem nos modelos — precisam ser
criados. Os demais já existem e só precisam estar preenchidos.

## Regras gerais

- **Não excluído e não protótipo.** Só elementos válidos (não deletados, não
  prototypes) são lidos.
- **Campos preenchidos.** Cada estrutura depende do campo indicado abaixo. Sem o
  campo/valor, a estrutura sai vazia.
- **Cenário e estado ativo.** Extraia no cenário correto. Estruturas marcadas
  *(ativa)* precisam estar ativas nesse cenário.
- **Coordenadas em pés.** O modelo deve estar em pés; o município escolhido na
  tela define a zona UTM da saída.

---

## SAA — WaterGEMS

### Pontos

| Estrutura | Elemento | O que fazer no WaterGEMS |
|---|---|---|
| Reservatório elevado | Tank | Preencher `Tipo_de_Reservatório` = **3** |
| Reservatório apoiado | Tank | Preencher `Tipo_de_Reservatório` = **2** |
| Reservatório semienterrado | Tank | Preencher `Tipo_de_Reservatório` = **1** |
| ETA | Reservoir | Criar e preencher `Tipo_de_Fonte` = **0** **(novo)** · manter *(ativa)* |
| Poço tubular / captação | Reservoir | Criar e preencher `Tipo_de_Fonte` = **1** **(novo)** |
| Elevatória de água (EEA) | Pump | Modelar como Pump e manter *(ativa)* — sem campo |
| VRP | PRV | Modelar como PRV e manter *(ativa)* — sem campo |

### Linhas

| Estrutura | Elemento | O que fazer no WaterGEMS |
|---|---|---|
| Rede de distribuição | Pipe | Preencher `Classe_Macro` = **0** |
| Adutora | Pipe | Preencher `Classe_Macro` = **1** |

---

## SES — SewerGEMS

### Pontos

| Estrutura | Elemento | O que fazer no SewerGEMS |
|---|---|---|
| Elevatória de esgoto (EEE) | Wet Well | Modelar como Wet Well — sem campo |
| Corpo receptor | Outfall | Modelar como Outfall — sem campo |
| ETE | Manhole | Criar e preencher `Estrutura_ETE` = **1** **(novo)** |

### Linhas

| Estrutura | Elemento | O que fazer no SewerGEMS |
|---|---|---|
| Rede coletora | Conduit | Criar e preencher `Tipo_de_Rede` = **0** **(novo)** |
| Interceptor | Conduit | Criar e preencher `Tipo_de_Rede` = **1** **(novo)** |
| Emissário final | Conduit | Criar e preencher `Tipo_de_Rede` = **2** **(novo)** |
| Linha de recalque | Pressure Pipe | Modelar como Pressure Pipe — sem campo |

---

## Campos comuns (todas as estruturas)

| Coluna da saída | Campo no modelo | Como preencher |
|---|---|---|
| `acao` | SAA: `Ação` ou `Situação` · SES: `ACAO_FICHA_TPF` ou `situacao` | Código inteiro da enumeração (Implantação, Ampliação, Melhoria, Desativação). Sem o campo, a coluna sai vazia. |
| `diametro` (linhas) | SAA: `Diâmetro_Comercial` · SES: `DIAMETRO_COMERCIAL` | Diâmetro comercial em mm (ex.: `75,0`). Se vazio ou `0`, a ferramenta usa o diâmetro físico do tubo. |
| `label` | (Label do elemento) | Preenchido automaticamente com o rótulo. |

---

## Resumo dos campos definidos pelo usuário

| Rede | Elemento | Campo | Valores | Situação |
|---|---|---|---|---|
| SAA | Tank | `Tipo_de_Reservatório` | 1 semi / 2 apoiado / 3 elevado | existente |
| SAA | Reservoir | `Tipo_de_Fonte` | 0 ETA / 1 Poço tubular | **novo** |
| SAA | Pipe | `Classe_Macro` | 0 rede / 1 adutora | existente |
| SAA | Pipe | `Diâmetro_Comercial` | mm (texto) | existente |
| SES | Conduit | `Tipo_de_Rede` | 0 coletora / 1 interceptor / 2 emissário | **novo** |
| SES | Manhole | `Estrutura_ETE` | 1 = ETE | **novo** |
| SES | Conduit / Pressure Pipe | `DIAMETRO_COMERCIAL` | mm | existente |
| SAA/SES | todos | `Ação`/`Situação` · `ACAO_FICHA_TPF`/`situacao` | código inteiro | existente |
