# Roteiro: de uma issue GitHub a um pull request

Reproducao independente do roteiro da palestra, importado no commit
`2cf8ee86934bbced1217b47f9690b89c4bd4989a` de
`githubevents/build-once-run-on-any-agent`, pasta `demos/dataforge`.
O historico Git preserva a copia original, a licenca MIT e a autoria de
Shishir Tewari. Toda operacao do ensaio deve apontar exclusivamente para
**micheliknechtel/dataforge-demo**, nunca para os repositorios de origem.

O objetivo nao e apenas gerar SQL: quatro skills genericas aprendem o contexto
do negocio por um manifest resolvido. Ticket ja existe como referencia;
Incident sera construido ao vivo, e Release fica fora do escopo.
Reserve aproximadamente quinze minutos para o roteiro, alem de instalacao,
autenticacao e revisoes; a duracao do agente pode variar.

## Preparacao

Na raiz de um clone novo:

```bash
bash scripts/setup-demo.sh
export PATH="$PWD/.tools/bin:$PATH"
node scripts/github.mjs check
python3 examples/support-desk/seed.py --check --initial
copilot skill list
copilot --agent forge-init
```

O setup cria `warehouse/zone1.duckdb` e `zone2.duckdb` no exemplo com dados
ficticios. Nao cria issues, labels, PRs nem executa o deploy de Incident.
DuckDB nao precisa de conta de nuvem; GitHub e Copilot precisam de login e
permissoes. Resolva falhas de autenticacao antes de continuar.

Abra a **raiz do repo** no Copilot ou VS Code, como explicado no README.
`node scripts/workspace.mjs` deve apontar para o seed em
`examples/support-desk/dataforge.manifest.yaml`, nao para `assets/`.
Comandos de warehouse e runners usam `examples/support-desk` como CWD;
skills, referencias e `.build-state/` pertencem a raiz do pacote.
O verifier deve ser invocado por caminho absoluto a partir do CWD do projeto.

Os hooks Claude/Cursor apenas verificam a existencia dos manifests e emitem um
aviso; nao leem seu conteudo e nao executam `forge-init`.
No Copilot, selecione ou invoque a skill/agente explicitamente.

## Ato 1 - Inicio sem configuracao resolvida

Diga ao `forge-init`:

> initialize dataforge; use o projeto selecionado pelo workspace e pare para eu revisar o resumo

Ele le o seed do projeto e descobre:

| Fonte | O que aprende |
| --- | --- |
| `warehouse/*.duckdb` | Duas zonas, ordem zone1 e depois zone2 |
| `information_schema` | Tres tabelas de origem e seus tipos |
| `support_metric_store/` | Dominio service_delivery; Ticket ja implementado |
| `Ticket/Schema/*.sql` | Tres grains: Account, Workspace, User; Daily e Cumulative |
| `Ticket/Code/*.py` | Gramatica `total_{entity}_{verb}_count` e padrao de pipelines |
| `common/config.py` | Globais injetados pelos runners |

O override do seed acrescenta `resolve` aos verbos aprendidos de Ticket.
O resultado e `examples/support-desk/dataforge.manifest.resolved.yaml`.
Abra o arquivo e confira repositorio, caminhos, catalogos, grains e zonas;
so confirme o resumo quando estiver correto. O seed e a fonte persistente;
correcoes entram em `overrides`, nao no arquivo gerado.

Explique: `orchestration.supported` e false porque DuckDB nao tem scheduler.
O agente registra a limitacao em vez de inventar jobs.

## Ato 2 - Intake da sua propria issue

Revise primeiro `issues/incident-metrics.md`; ele mantem o pedido vago
intencionalmente. Os comandos abaixo sao para **voce executar no ensaio**:

```bash
cd examples/support-desk
node ../../scripts/github.mjs check
node ../../scripts/github.mjs label create metric-request --color 0E8A16 \
  --description "Request for a new metric build" --force
node ../../scripts/github.mjs issue create --title "Add incident lifecycle metrics" \
  --body-file issues/incident-metrics.md --label metric-request
```

O wrapper confere seed, manifest resolvido e remoto e acrescenta
`--repo micheliknechtel/dataforge-demo`. Ele nao substitui login nem permissoes.
O equivalente sem wrapper exige destino explicito, por exemplo:
`gh issue view N --repo micheliknechtel/dataforge-demo`.

No Copilot aberto na raiz, selecione `forge-builder` e diga:

> build the metrics in issue #N; use somente o repositorio configurado e preserve todos os checkpoints humanos

Use o numero realmente retornado, nao assuma #1. O agente consulta a issue,
propoe defaults do manifest e pede confirmacao de grains, verbos, cadencias e
tratamento de soft-delete. Esse e o primeiro de sete checkpoints.

## Ato 3 - Descoberta e desenho

Nas fases 2 e 3, `forge-builder` usa `forge-dbx` para consultar DuckDB.
O profiling agregado de `demo_gold_source_a.incidents` verifica os IDs de
Account, Workspace e User. A politica de egress proibe extracao de linhas
brutas, inclusive com dados sinteticos; mostre metadados e agregacoes.

`forge-lint` valida a gramatica. `total_incident_create_count` e
`total_incident_resolve_count` seguem o padrao; `incident_count` e
`num_incidents_opened` nao. Revise as definicoes e confirme o desenho antes
de permitir engenharia.

## Ato 4 - Geracao de codigo

As fases 4 e 5 geram seis arquivos `Schema/*.sql` e dois `Code/*.py`
em `support_metric_store/service_delivery/Incident/`. Compare com Ticket:
mesma estrutura, colunas de sistema e contrato de runner.
O agente executa `skills/forge-builder/verify.py` da raiz do pacote, mantendo
o projeto como CWD, nos limites de fase e checkpoints.

Os runners **imprimem SQL**, nao o executam. No CWD do exemplo:

```bash
python3 support_metric_store/common/daily_runner.py \
  support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Daily.py
```

Se faltarem artefatos ou checkpoints, corrija antes de seguir. Nao aceite
evidencia inventada, nem continue porque o agente apenas disse "passou".

## Ato 5 - Testes e deploy aprovado

A fase 6 gera `Code/__incident_test.sql` e o executa via `forge-dbx`.
Na fase 7, o guardrail S5 exige mostrar **todo o SQL das seis DDLs** e parar.
O deploy so pode ocorrer depois da sua aprovacao explicita desse SQL.
Zone1 deve terminar com sucesso antes de iniciar zone2; falha interrompe tudo.

**Somente depois dessa aprovacao e da criacao validada das tabelas**, o
backfill abaixo carrega trinta dias. Ele demonstra o contrato runner -> SQL ->
DuckDB por data e por zona. Execute em Bash, no CWD do exemplo:

```bash
set -euo pipefail
for zone in zone1 zone2; do
  for i in $(seq 30 -1 1); do
    SNAP=$(python3 -c "import datetime as dt,sys;print(dt.date.today()-dt.timedelta(days=int(sys.argv[1])))" "$i")
    SOURCE_ZONE="$zone" SNAPSHOT_DATE="$SNAP" python3 support_metric_store/common/daily_runner.py \
      support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Daily.py \
      | duckdb "warehouse/$zone.duckdb"
    SOURCE_ZONE="$zone" SNAPSHOT_DATE="$SNAP" python3 support_metric_store/common/cumulative_runner.py \
      support_metric_store/service_delivery/Incident/Code/Incident_Metrics_Snapshot_Cumulative.py \
      | duckdb "warehouse/$zone.duckdb"
  done
done
```

Veja os dois nomes de metricas com agregacoes, em ambas as zonas:

```bash
for zone in zone1 zone2; do
  duckdb "warehouse/$zone.duckdb" -readonly -c "
SELECT metric_name, COUNT(*) AS rows, SUM(metric_value) AS total
FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Daily
GROUP BY 1 ORDER BY 1;"
done
```

Depois compare o Cumulative mais recente com contagens diretas da origem.
Os totais devem concordar exatamente, excluindo `is_deleted = true`.
O seed contem 120 dias, e o ultimo snapshot do backfill e ontem.
Confirme no desenho se "resolve" exige status resolved, closed_at ou ambos.

```bash
duckdb warehouse/zone1.duckdb -readonly -c "
SELECT metric_name, SUM(metric_value) AS metric_store_says
FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Cumulative
WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM demo_gold_support_metric_store.Incident_Account_Metrics_Snapshot_Cumulative)
GROUP BY 1 ORDER BY 1;
SELECT COUNT(*) AS source_created, COUNT(*) FILTER (WHERE status = 'resolved') AS source_resolved
FROM demo_gold_source_a.incidents WHERE is_deleted = false;"
```

Repita em zone2. Atualize o README da entidade e revise o diff. O agente cria
uma branch de ensaio e um PR **no seu repo**, usando o default branch consultado
(`master` nesta copia), com `Closes #N` no corpo. Nao crie PRs no upstream.
No worktree do app, mantenha a branch atribuida pelo app.

## Fechamento - O que mudar o engine significa

Mostrar `platform.engine: "databricks"` explica a selecao de outro adaptador,
nao uma migracao completa. Databricks ainda exige CLI, credenciais/perfis,
catalogos/dados adequados e validacao do ambiente. Nada disso foi executado
nesta preparacao. Mantenha `duckdb` para repetir o ensaio local.

## Repetir sem apagar seu trabalho

Para um roteiro inteiro novo, use outro clone em uma pasta nova e rode o setup.
As issues e PRs existentes continuam no GitHub; use os novos numeros ou revise
uma issue anterior. Nao e necessario apagar nada no upstream.

Se quiser apenas reconstruir os dados sinteticos deste clone:

```bash
# Na raiz; descarta SOMENTE os dois bancos locais gerados.
bash scripts/setup-demo.sh --reseed
```

Isso nao remove codigo Incident, manifest resolvido nem checkpoints.
Para preservar um ensaio parcial e voltar ao estado inicial de codigo, prefira
outro clone. Nao use git clean, reset amplo ou remocao generica de .build-state.
