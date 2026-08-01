# Requisitos do modelo — WaterGEMS (SAA) e SewerGEMS (SES)

Para a ferramenta reconhecer as estruturas e gerar a saída no padrão do projeto,
cada elemento precisa de **campos definidos pelo usuário** (User Data Extensions)
criados e preenchidos no modelo, com os nomes e códigos abaixo. Os nomes batem de
forma **exata** (maiúsculas e acentos incluídos).

Cada estrutura é identificada por um campo **discriminador** (um código inteiro).
Se o campo discriminador **não existir** no modelo, todas as feições daquele
elemento caem na estrutura **padrão** e o resumo mostra um **aviso** (amarelo). Se
um campo de saída (`Situacao`, `Diametro_Comercial`) faltar, a coluna sai vazia.

## Regras gerais

- **Não excluído e não protótipo.** Só elementos válidos (não deletados, não protótipos) são lidos.
- **Cenário e estado ativo.** Extraia no cenário correto. ETA, EEA e VRP precisam estar **ativas** nesse cenário.

## Aviso de campo ausente

Quando o campo discriminador não existe no modelo, o resumo mostra um **aviso
amarelo** com uma destas mensagens (exemplo com `Tipo_Reservatorio`):

- Estrutura **padrão**, que recebe todas as feições do elemento:
  `Campo 'Tipo_Reservatorio' ausente no modelo — todas as feições foram classificadas como 'Reservatórios apoiados'.`
- **Demais estruturas** do mesmo elemento, que ficam vazias:
  `Campo 'Tipo_Reservatorio' ausente no modelo — feições classificadas como Reservatórios apoiados; esta estrutura ficou vazia.`
- Elemento **sem estrutura padrão** (ex.: ETE em Manhole):
  `Campo 'TIPO_DESTINO' ausente no modelo — esta estrutura ficou vazia.`

---

## SAA — WaterGEMS

| Elemento | Campo | Domínio | Padrão |
|---|---|---|---|
| Tank | `Tipo_Reservatorio` | `{0: RAP, 1: REL, 2: RSE}` | `0` (RAP) |
| Reservoir | `Tipo_Fonte` | `{0: Captação, 1: ETA}` | `0` (Captação) |
| Pump | `Tipo_Bomba` | `{0: EEA, 1: Booster, 2: Bomba Poço}` | `0` (EEA) |
| Pipe | `Tipo_Rede` | `{0: Rede, 1: Adutora}` | `0` (Rede) |
| Pipe | `Diametro_Comercial` | mm — texto (ex.: `75,0`) | — (vazio) |
| todos | `Situacao` | `{0: Implantação, 1: Ampliação, 2: Melhoria, 3: Desativação}` | — (vazio) |

Sem campo: **VRP** (elemento PRV) é identificada pelo tipo de elemento — ativa no cenário.

## SES — SewerGEMS

| Elemento | Campo | Domínio | Padrão |
|---|---|---|---|
| Conduit | `TIPO_REDE` | `{0: Rede coletora, 2: Emissário final, 3: Interceptor}` | `0` (Rede coletora) |
| Pressure Pipe | `TIPO_REDE` | `{1: Linha de recalque}` | `1` (Linha de recalque) |
| Manhole / Outfall | `TIPO_DESTINO` | `{0: Corpo receptor, 1: ETE}` | `0` (Corpo receptor)¹ |
| Conduit / Pressure Pipe | `DIAMETRO_COMERCIAL` | mm — texto | — (vazio) |
| todos | `situacao` | `{0: Implantação, 1: Ampliação, 2: Melhoria, 3: Desativação}` | — (vazio) |

Sem campo: **EEE** (elemento Wet Well) é identificado pelo tipo de elemento.

¹ O padrão `Corpo receptor` vale para Outfall. **ETE** só é lida em Manhole/Outfall
com `TIPO_DESTINO = 1`; sem o campo, nenhum Manhole vira ETE.
