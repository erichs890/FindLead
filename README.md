# CaçaLead

Prospecção de clientes para quem faz sites: acha empresas recém-abertas na sua região (pela base aberta de CNPJ da
Receita Federal), que provavelmente ainda não têm site, e organiza o contato num mini-CRM.

Roda **inteiro no seu computador**, como o ACV: sem banco na nuvem, sem login, sem mensalidade. Os dados ficam em
`%LOCALAPPDATA%\CacaLead`.

## Como usar

1. Instale o **Node.js 24** ou mais novo ([nodejs.org](https://nodejs.org)).
2. Abra `atualizar-base.bat` e ajuste a linha `FILTROS` (UFs e data mínima). Dê dois cliques nele. A primeira carga
   leva de 45 a 60 minutos. Depois, uma vez por mês.
3. Dê dois cliques em `start.bat`. A tela abre em http://localhost:5173.
4. Em **Ajustes**, escolha sua região, seu nome e a mensagem de apresentação.

Precisa de **~3 GB livres** durante a ingestão (ZIPs, apagados no fim) + o tamanho da base (tabela abaixo).

### O que tem na tela

- **Buscar** — UF, cidade, atividade (CNAE, por nome ou código), período de abertura, porte, "tem telefone/e-mail",
  "só contato direto" (esconde quem só tem contato de contador) e nome. Os filtros ficam na URL: dá para salvar
  uma busca nos favoritos. **Exportar CSV** baixa tudo que os filtros pegam, no formato do Excel brasileiro.
- **Detalhe do lead** — status (Novo, Contatado, Respondeu, Fechado, Descartado), WhatsApp com mensagem
  editável (só para celular), ligar, e-mail, "ver se já tem site" no Google, dados da empresa, **Enriquecer**
  pela BrasilAPI (situação de hoje + sócios, cache de 24 h), notas e **não contatar**.
- **Leads** — o seu CRM, por status.
- **Painel** — aberturas por semana na sua região e o funil dos seus leads.

"Últimos 7 dias" conta a partir da **abertura mais recente da base**, não de hoje: a Receita publica com semanas
de atraso, e contar de hoje mostraria sempre uma lista vazia.

### Por que roda local e não na nuvem

A base de SP desde 2023 tem ~0,8 GB; o Brasil, ~2 GB. O Supabase grátis aceita 500 MB. Localmente não há limite,
custo nem login, e a busca num SQLite no seu SSD responde em milissegundos. O servidor só escuta em `127.0.0.1`:
nada fica exposto na rede.

## Código

```
core/                     Node 24 rodando TypeScript direto (sem build)
  server.ts               API em http://localhost:4790
  busca.ts                filtros, paginação por cursor, detalhe, painel
  brasilapi.ts            enriquecimento com cache de 24 h e nova tentativa em 429/5xx
  base.ts                 anexa a base da Receita à conexão do CRM e troca quando sai uma nova
  armazenamento/crm.ts    seus leads, notas, opt-out, preferências (crm.db)
  armazenamento/receita.ts qual base está no ar (atual.json)
  ingestao/               download, leitura dos ZIPs, gravação e verificações
src/                      tela em React + Tailwind (Vite, porta 5173)
  paginas/                Buscar, Leads, Painel, Ajustes
  componentes/            DetalheLead, Frescor, Autocompletar...
  tipos.ts                tipos compartilhados entre tela e servidor
```

Para desenvolver: `npm run core` (servidor que reinicia ao salvar) e `npm run dev` (tela).

## A base da Receita

### Atualizar (uma vez por mês)

```bash
npm run ingestao -- --ufs=SP --desde=2024-01-01
```

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `--ufs=SP,RJ` | todas | UFs a importar |
| `--desde=2024-01-01` | 1º de janeiro de dois anos atrás | só empresas abertas a partir desta data (`todas` = sem limite) |
| `--situacoes=02` | `02` (ativa) | `01` nula, `02` ativa, `03` suspensa, `04` inapta, `08` baixada |
| `--mes=2026-10` | o mais recente | mês publicado pela Receita |
| `--paralelo=3` | 3 | arquivos processados ao mesmo tempo |
| `--conexoes=6` | 6 | conexões simultâneas com a Receita, no total |
| `--manter-zips` | não | guarda os ZIPs pra rodar de novo sem baixar |
| `--teste` | — | baixa e lê tudo, mostra o que entraria, **não grava nada** |

Pode rodar de novo quando quiser: cada carga monta um arquivo novo e só no fim troca o ponteiro
(`receita/atual.json`). Se cair no meio (internet, Ctrl+C, falta de luz), a base anterior continua valendo e o
download recomeça de onde parou. **O seu CRM fica em outro arquivo (`crm.db`) e nunca é tocado pela ingestão.**

A Receita publica no meio de cada mês. Uma empresa "recém-aberta" chega aqui com 2 a 6 semanas de vida.

### Tamanho e tempo

Medido em 27/10/2026 com os arquivos de 2026-10:

| | |
| --- | --- |
| Download | ~7 GB por mês (Estabelecimentos 5,3 GB · Empresas 1,4 GB · Simples 0,3 GB) |
| Velocidade da Receita | 0,3–1 MB/s **por conexão**; ~4 MB/s com as 6 conexões padrão |
| Download completo | 30–45 min (depende mais do servidor da Receita que da sua internet; ele derruba conexões e o download retoma sozinho) |
| Leitura + gravação | ~90 mil linhas/s; ~74 milhões de linhas de Estabelecimentos → ~15 min, em paralelo com o download |
| Total de uma carga | **~45–60 min** |
| Base de SP, abertas desde 2023 | ~2,6 milhões de estabelecimentos, ~0,8 GB (estimado a partir de 2 dos 10 arquivos) |
| Brasil inteiro, abertas desde 2024 | ~6 milhões de estabelecimentos, ~2 GB (estimado) |

O download é sempre o mesmo, importe uma cidade ou o país: os arquivos da Receita não são separados por UF, então
tudo é lido e o filtro acontece durante a leitura. Eles são divididos por faixa de CNPJ: o `Estabelecimentos0`
(2,3 GB, 31 milhões de linhas) concentra as empresas recentes — sozinho, deu 1,96 milhão das abertas em SP desde 2023.

### O que vem da Receita (e as armadilhas tratadas)

- **Endereço novo.** O caminho antigo (`dados/cnpj/dados_abertos_cnpj/`) dá 404. Os arquivos estão num
  compartilhamento Nextcloud do SERPRO, lido via WebDAV público (`core/ingestao/download.ts`).
- **Encoding.** Os CSVs são windows-1252, não UTF-8. Lidos como latin1 puro, aspas curvas e travessões viram
  caracteres de controle invisíveis no nome da empresa.
- **Sem cabeçalho, separador `;`, linhas tortas.** Há aspas soltas dentro de campos. Linha com número errado de
  colunas é descartada e contada (aviso se passar de 0,1%), em vez de derrubar o arquivo.
- **Datas impossíveis** (`20230231`, `00000000`) viram vazio.
- **Celular sem o nono dígito.** O campo de telefone tem 8 posições: `(11) 9470-9964` é `(11) 99470-9964`.
  Número de 8 dígitos começando com 6–9 é móvel (Anatel) e ganha o 9 de volta; sem isso, nenhum celular seria
  reconhecido e o WhatsApp nunca apareceria.
- **Município é código da Receita, não do IBGE**, e o arquivo de municípios não traz a UF — ela é deduzida dos
  próprios estabelecimentos.
- **Razão social e porte ficam em outro arquivo** (Empresas), ligado pelos 8 primeiros dígitos do CNPJ. São 60
  milhões de linhas: só entram as empresas que têm estabelecimento importado (filtro em memória, 12,5 MB).
- **Telefone e e-mail do contador.** Muitos cadastros trazem o contato do escritório de contabilidade. A ingestão
  conta, no país inteiro, quantas empresas usam cada e-mail/telefone: com 5 ou mais, ele é marcado como
  compartilhado (`contatos_compartilhados`), e a tela vai avisar "provável contador".
- **Sócios não são importados**: vêm da BrasilAPI, um CNPJ por vez, quando você abre o lead.

### Estrutura da base (`receita-*.db`)

| Tabela | Conteúdo |
| --- | --- |
| `estabelecimentos` | CNPJ, nome fantasia, situação, abertura, CNAEs, endereço, UF, município, telefones, e-mail |
| `empresas` | razão social, natureza jurídica, capital social, porte (`1` micro, `3` EPP, `5` demais) |
| `simples` | opção pelo Simples e pelo MEI |
| `cnaes`, `municipios`, `naturezas` | tabelas de domínio, com coluna sem acento para busca |
| `contatos_compartilhados` | e-mails/telefones usados por 5+ empresas |
| `info` | mês e filtros da carga |

Índices: (UF, município, abertura), (UF, abertura), (abertura), (CNAE, abertura) e CNPJ único. Não há índice de
situação cadastral sozinha: com cinco valores possíveis o SQLite nunca o usaria. Ele só é criado (junto com a data)
quando a carga tem mais de uma situação.

## Onde ficam os dados

```
%LOCALAPPDATA%\CacaLead\
  crm.db            seus leads, status, notas, opt-out, cache da BrasilAPI
  receita\          base(s) da Receita + atual.json (qual está no ar) + historico.jsonl
  downloads\        ZIPs durante a ingestão
```

`CACALEAD_DIR` troca a pasta (útil para testar sem tocar nos dados reais).

## Verificações

```bash
npm run check
```

```bash
npm run build
```

# FindLead
