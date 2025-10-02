# Vai chover? — App Web (Open‑Meteo)

Aplicativo estático em HTML/CSS/JS que responde:

- Agora/próximas horas: “Vai chover?” com base em mm acumulado (6h) e probabilidade (24h).
- Nesta semana: resumo de 7 dias, cartões por dia, veredito semanal e “mood” visual.
- Busca com autocomplete (geocoding Open‑Meteo) e geolocalização do navegador.

Principais características

- 100% client‑side (sem backend) e sem necessidade de API key.
- Open‑Meteo Forecast + Geocoding.
- Heurísticas simples porém transparentes, com thresholds configuráveis.
- UI glassmorphism responsiva com dropdown translúcido alinhado ao tema.
- Tema muda automaticamente conforme o clima da semana (seco, chuva isolada, semana chuvosa) e o estado atual (dia/noite/chuva).

Arquitetura de pastas

- `index.html`: marcação e seções de UI (busca, cartões, semana, rótulo de tema).
- `styles.css`: layout base, componentes e efeitos de vidro (consome os tokens dos temas).
- `themes-week.css`: tokens de paleta para cada padrão de semana/tempo (ações rápidas de customização).
- `script.js`: lógica (busca, geocoding, fetch previsão, heurísticas, renderização, autocomplete, temas).
- `docs/diagram.puml`: diagrama UML (PlantUML) do fluxo do app.

Como rodar

- Opção rápida: abrir `index.html` em um navegador moderno.
- Para geolocalização: servir via HTTP local (ex.: VS Code Live Server) por políticas de permissão.

APIs utilizadas

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=...&count=...&language=pt&format=json`
- Previsão: `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=...&hourly=...&daily=...&forecast_days=7&timezone=auto`

Fonte de dados

- Única fonte: Open‑Meteo (sem API key e sem cabeçalhos especiais), usada para geocoding e previsão (current/hourly/daily).

Heurísticas e parâmetros

- Agora/curto prazo (horário):
  - `sum6 = soma precipitação das próximas 6h`
  - `prob24 = probabilidade máxima das próximas 24h`
  - Regras:
    - `sum6 >= 1 mm` ou `prob24 >= 70%` → “Vai chover”
    - `prob24 >= 40%` ou `sum6 > 0` → “Pode chover”
    - Caso contrário → “Não deve chover”
- Semana (diário):
  - Por dia: usar `daily.precipitation_sum` e `daily.precipitation_probability_max`.
  - Thresholds (config em `script.js`):
    - `WEEK_MM_THRESHOLD = 2` mm/dia
    - `WEEK_POP_THRESHOLD = 60%`
  - Dia chuvoso: `mm >= 2` OU `pop >= 60`.
  - Semana:
    - 0 dias chuvosos → “Não deve chover na semana”
    - 1–2 dias → “Chuva isolada nesta semana”
    - ≥ 3 dias → “Semana chuvosa”
  - Confiança por dia: barra baseada em `pop/100` (ou mm normalizado quando `pop` ausente).

Autocomplete de locais

- Enquanto digita (a partir de 2 caracteres), consulta o geocoding com debounce (200 ms), lista até 5 sugestões.
- Seleção por mouse ou teclas (setas/Enter). `Esc` fecha a lista.
- Dropdown translúcido herda as cores do tema ativo e fica sempre sobre os demais cards.

Estatísticas e avaliação (base teórica incluída)

- Contínuos: MAE, RMSE, Bias, correlação de Pearson r, R².
- Binário (chuva dia a dia): POD, FAR, Precisão, HSS, ETS.
- Probabilístico: Brier Score e Brier Skill Score.
- Uso prático: calibrar os thresholds por região e estação ao comparar previsões com observações históricas.

Limitações

- Sem offline/histórico local; avaliação quantitativa requer observações reais.
- Modelos podem errar mais em horizontes longos (>4–5 dias).

Personalização rápida

- Ajuste os thresholds em `script.js`:
  - `WEEK_MM_THRESHOLD`, `WEEK_POP_THRESHOLD`.
- Mudar cidade inicial: chamada em `window.load` (coordenadas/label).
- Filtrar sugestões por país: adaptar `geocode()` para restringir resultados.

Temas e visual

- As paletas ficam em `themes-week.css`, com tokens (background, cards, inputs, botões, chips, barras) para cada padrão:
  - Semana seca (clear-day/cloudy/night/rain/rain-heavy) → tema definido pelo tempo atual.
  - Chuva isolada (1–2 dias chuvosos) → `theme-week-isolated` domina a UI.
  - Semana chuvosa (3+ dias) → `theme-week-wet` domina.
- Os gradientes de fundo são controlados via classes `week-bg-0..3` (0 a ≥5 dias chuvosos).
- Para customizar, edite os tokens de cada bloco no `themes-week.css`. `styles.css` apenas consome as variáveis.

Glassmorphism / layout

- Cards, chips e popover usam `backdrop-filter` para efeito de vidro.
- A área de busca é uma grid: input full-width + botões à direita, com status logo abaixo.

Créditos

- Dados: Open‑Meteo (Forecast e Geocoding) – sem API key.
- Ícones/emojis nativos.


![Tela inicial](docs\VaiChoverApp.svg)
