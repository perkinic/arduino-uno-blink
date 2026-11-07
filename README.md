# 🗑️ Lixeira Automática + 🔴 Barreira a Laser + 🌧️ Alarme de Chuva (Arduino Uno)

Um sensor ultrassônico **HC-SR04** mede a distância e um **servo motor** abre a tampa da lixeira quando alguém se aproxima. Quando a frente fica livre, a tampa fecha sozinha.

Um **laser** aponta para um **sensor de luz**: enquanto o feixe estiver obstruído, o **buzzer** apita de forma intermitente. Quando o feixe volta, ele para sozinho.

Um **sensor de chuva** aciona o mesmo buzzer enquanto a placa estiver molhada.

Os sistemas são independentes e rodam juntos no mesmo Arduino. O buzzer toca se o feixe estiver obstruído **ou** se houver chuva, e só para quando os dois estiverem normais.

> ⚠️ **Laser:** nunca olhe para o feixe nem o aponte para os olhos de alguém ou para superfícies que reflitam (espelho, metal polido, vidro). Confira a mira de lado.

> 🎓 **Explicação interativa:** abra [`docs/index.html`](docs/index.html) no navegador para ver o simulador, o mapa de pinos, os sensores, o tour pelo código e um quiz. Funciona offline e não precisa instalar nada.

## 📦 Materiais necessários

| Item | Quantidade | Observação |
|------|-----------:|------------|
| Arduino Uno | 1 | |
| Sensor ultrassônico HC-SR04 | 1 | mede a distância de quem se aproxima |
| Servo motor (SG90 / MG996R) | 1 | abre a tampa |
| Módulo laser (KY-008 ou similar) | 1 | emite o feixe da barreira |
| Módulo sensor de luz com saída digital (`VCC` / `GND` / `DO`) | 1 | detecta o feixe; o potenciômetro ajusta a sensibilidade |
| Sensor de chuva com módulo comparador (`VCC` / `GND` / `DO` / `AO`) | 1 | detecta água na placa; o potenciômetro ajusta a sensibilidade |
| Buzzer ativo | 1 | apita só de ligar o sinal, sem precisar de frequência |
| Fonte externa 5 V (≥ 1 A) | 1 | recomendada para o servo (evita o Arduino reiniciar) |
| Protoboard | 1 | facilita dividir o 5V e o GND entre os módulos |
| Fios jumper | ~20 | |

## 🔌 Montagem elétrica

Resumo dos pinos usados:

| Pino | Ligado em | Função |
|---:|---|---|
| 2 | `DO` do sensor de luz | lê se o feixe está chegando |
| 3 | `DO` do sensor de chuva | lê se a placa está molhada |
| 4 | `Trig` do HC-SR04 | dispara a medição |
| 5 | `Echo` do HC-SR04 | recebe o eco |
| 7 | sinal do laser | liga o laser |
| 9 | sinal do servo | move a tampa |
| 12 | sinal do buzzer | faz o apito |

```
HC-SR04                 Arduino Uno
----------------        -----------
VCC      --------------  5V
GND      --------------  GND
Trig     --------------  Pino 4
Echo     --------------  Pino 5
```

```
Servo (SG90/MG996R)      Ligacao
-------------------      -------
Fio amarelo (sinal) ---  Pino 9
Fio vermelho (VCC)  ---  +5V da fonte externa (ou 5V do Arduino, se for um SG90 sozinho)
Fio marrom/preto    ---  GND da fonte externa  --  GND do Arduino (GND comum)
```

```
Sensor de luz           Arduino Uno
----------------        -----------
VCC      --------------  5V
GND      --------------  GND
DO       --------------  Pino 2
```

```
Sensor de chuva         Arduino Uno
----------------        -----------
VCC      --------------  5V
GND      --------------  GND
DO       --------------  Pino 3
AO       --------------  (nao usado)
```

A placa de chuva liga no módulo comparador pelos 2 pinos do outro lado do módulo. Esses 2 fios não têm polaridade.

```
Laser                   Arduino Uno
----------------        -----------
Sinal    --------------  Pino 7
GND      --------------  GND
VCC      --------------  5V (se o seu módulo tiver este pino)
```

```
Buzzer                  Arduino Uno
----------------        -----------
Sinal    --------------  Pino 12
GND      --------------  GND
VCC      --------------  5V (se o seu módulo tiver este pino)
```

- O **HC-SR04** trabalha em 5 V e o `Echo` pode ligar direto no pino 5.
- O **servo** precisa do **GND comum** com o Arduino. Um SG90 sozinho costuma funcionar nos 5 V da placa; um MG996R (ou tampa pesada) exige fonte externa.
- O **módulo comparador** do sensor de chuva não pode molhar: só a placa de chuva fica exposta à água.
- A ordem dos pinos muda de um módulo para outro: siga sempre os nomes impressos na placa de cada um.

> ⚠️ **Confira o furo do GND.** O GND da fileira digital do Uno fica colado no pino 13 e no AREF (`12 | 13 | GND | AREF`), então é fácil ligar o fio um furo ao lado. Foi um fio de GND nessa posição que fez o sensor de luz acender no reset e apagar cerca de 1 segundo depois. Na dúvida, use os GND da fileira POWER, ao lado do pino `5V`.

### Alinhar o laser

1. Coloque o laser e o sensor de luz frente a frente, na mesma altura e bem presos, para a mira não sair do lugar.
2. Aponte o feixe para o componente sensor do módulo. Confira a mira de lado, sem colocar o rosto no caminho do feixe.
3. Gire o potenciômetro do módulo devagar até o LED de sinal mudar quando você coloca e tira a mão da frente do feixe.

## 🚀 Gravar no Arduino

1. Feche o Monitor Serial, porque ele ocupa a porta e impede a gravação.
2. Confira a porta em `upload_port` no `platformio.ini` (neste projeto, `COM7`).
3. Grave pelo botão **Upload** do PlatformIO no VS Code ou com o comando `pio run -t upload`.

## ⚙️ Como funciona

### Lixeira

1. A cada 120 ms o HC-SR04 mede a distância (ele pede ≥ 60 ms entre pulsos).
2. Se algo ficar a **até 25 cm** (`distanciaAbrir`), a tampa abre até 110° (`anguloAberto`).
3. Quando o objeto sai (mais de 35 cm, a `distanciaFechar`) por 3 leituras seguidas **e** já passaram 3 s (`tempoMinimoAberto`), a tampa fecha.
4. Leitura inválida (`--`, sem eco ou sensor desconectado) **nunca** abre a tampa e conta como frente livre.
5. Com a tampa fechada e parada há 2 s, o servo é solto (`detach`) para não tremer, aquecer nem puxar corrente à toa.

### Barreira a laser

1. Ao ligar, o programa acende o laser (pino 7 em HIGH) e espera 200 ms (`esperaLaserLigar`) para o sensor reagir. O laser fica ligado o tempo todo.
2. A cada volta do `loop()`, o programa lê o pino 2. Com este módulo, `HIGH` significa feixe obstruído e `LOW` significa feixe chegando (`nivelObstruido`).
3. Uma mudança só vale depois de ficar estável por **50 ms** (`filtroFeixe`). Isso evita alarme falso por tremor do sensor, mas uma obstrução mais curta que isso não dispara o alarme.
4. Com o feixe obstruído, o buzzer alterna 200 ms apitando e 200 ms mudo (`intervaloBip`).
5. Com o feixe livre por 50 ms, o buzzer para. O alarme não fica travado: ele toca somente enquanto o feixe estiver obstruído.

Não há calibração nem estado guardado: tudo depende só do que o sensor mostra no momento. Por isso, reiniciar o Arduino com o feixe obstruído não atrapalha: o alarme toca logo depois do boot e para assim que o feixe voltar.

### Testar a barreira

| Situação | Resultado esperado |
|---|---|
| Laser no sensor | buzzer mudo, `feixe: livre` |
| Mão na frente do feixe | bi-bi-bi, `feixe: OBSTRUIDO` |
| Mão fora do feixe | buzzer para |
| Reset com a mão na frente do feixe | o alarme toca depois do boot e para ao tirar a mão |

### Sensor de chuva

1. A cada volta do `loop()`, o programa lê o pino 3. Com este módulo, `LOW` significa placa molhada e `HIGH` significa placa seca (`nivelChuva`).
2. Uma mudança só vale depois de ficar estável por **500 ms** (`filtroChuva`), porque as gotas fazem o sinal oscilar.
3. Enquanto a placa estiver molhada, o buzzer apita no mesmo ritmo da barreira. Ele só para depois que a placa secar, o que pode levar um tempo. Enxugar a placa acelera isso.
4. O pino usa `INPUT_PULLUP`: com o sensor solto, ele lê "seco" e não dispara alarme falso.

### Testar o sensor de chuva

| Situação | Resultado esperado |
|---|---|
| Placa seca | buzzer mudo, `chuva: nao` |
| Dedo molhado ou gotas na placa | depois de cerca de 0,5 s: bi-bi-bi, `chuva: SIM` |
| Placa enxugada | buzzer para, `chuva: nao` |

Se precisar, gire o potenciômetro do módulo até o LED de sinal reagir à água.

## 🎚️ Ajustes no topo de `src/main.cpp`

| Constante | Padrão | Para que serve |
|---|---|---|
| `distanciaAbrir` | 25 cm | abre quando algo estiver a esta distância ou menos |
| `distanciaFechar` | 35 cm | só fecha acima disso (histerese: evita abre-fecha-abre) |
| `distanciaMinima` | 2 cm | zona morta do HC-SR04 |
| `tempoMinimoAberto` | 3000 ms | fica aberta no mínimo 3 s |
| `leiturasParaFechar` | 3 | confirmações de "frente livre" antes de fechar |
| `anguloFechado` / `anguloAberto` | 0° / 110° | posições da tampa |
| `intervaloUltrassom` | 120 ms | ritmo da leitura (mínimo aceitável: 60 ms) |
| `tempoParaDescansarServo` | 2000 ms | tampa fechada e parada há mais tempo que isso → `detach()` |
| `intervaloServo` | 15 ms | **só com `SERVO_DEVAGAR`**: espera entre um grau e o próximo |
| `nivelObstruido` | `HIGH` | nível do sensor com o feixe obstruído |
| `nivelChuva` | `LOW` | nível do `DO` com a placa de chuva molhada |
| `nivelBuzzerApita` | `LOW` | nível do pino 12 que faz o buzzer apitar |
| `filtroFeixe` | 50 ms | tempo que a leitura precisa ficar estável para valer |
| `filtroChuva` | 500 ms | o mesmo filtro, para o sensor de chuva |
| `intervaloBip` | 200 ms | ritmo do apito intermitente |
| `esperaLaserLigar` | 200 ms | espera no boot para o sensor reagir ao laser. Aumente se o buzzer der um bip ao ligar |

Opções (`#define`):

- `SERVO_DESCANSAR` (**ativo**): solta o servo com a tampa fechada. Comente se a tampa precisa da força do servo para ficar fechada.
- `SERVO_DEVAGAR` (desligado): descomente para a tampa andar 1 grau por vez em vez de usar a velocidade normal do servo.

## 🖥️ Monitor serial

Abra a 9600 baud. Uma vez por segundo aparece a distância, o estado da tampa, o da barreira e o da chuva:

```
dist: 184 cm  | tampa: FECHADA (servo off)  | sensor: LOW  | feixe: livre  | DO chuva: HIGH  | chuva: nao
>> Obstaculo a 18 cm -> abrindo a tampa
>> Frente livre -> fechando a tampa
>> Servo em descanso (tampa fechada, sem corrente)
>> Feixe obstruido -> alarme
dist: 184 cm  | tampa: FECHADA (servo off)  | sensor: HIGH  | feixe: OBSTRUIDO  | DO chuva: HIGH  | chuva: nao
>> Feixe livre
>> Chuva detectada -> alarme
dist: 184 cm  | tampa: FECHADA (servo off)  | sensor: LOW  | feixe: livre  | DO chuva: LOW  | chuva: SIM
>> Placa de chuva seca
```

- `sensor:` é o nível lido agora no pino 2, sem filtro. É o melhor campo para diagnosticar a barreira.
- `feixe:` é o estado confirmado depois do filtro de 50 ms.
- `DO chuva:` é o nível lido agora no pino 3, sem filtro.
- `chuva:` é o estado confirmado depois do filtro de 500 ms.

Envie `l` + ENTER para alternar entre o log normal (1/s) e o rápido (5/s).

## 🩺 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `dist: --` o tempo todo | HC-SR04 sem alimentação ou `Trig`/`Echo` trocados | conferir VCC, GND e os pinos 4 e 5 |
| Servo **treme** ou o Arduino **reinicia** ao girar | servo puxando corrente do pino 5V do Uno | fonte externa de 5 V com **GND comum** |
| Servo gira rápido demais | velocidade normal do servo | descomentar `#define SERVO_DEVAGAR` (e ajustar `intervaloServo`) |
| LEDs do sensor de luz acendem no reset e apagam cerca de 1 s depois | `VCC` ou `GND` do sensor fora dos pinos de alimentação, ou com mau contato | ligar o `VCC` no `5V` e o `GND` em um GND da fileira POWER. Apertar o reset não corta o 5V, então um sensor bem ligado não reage ao reset |
| Alarme toca com o feixe no sensor | sensor sem energia, mira fora do sensor ou sensibilidade mal ajustada | conferir os LEDs do módulo, a mira e o potenciômetro |
| `sensor:` não muda ao obstruir o feixe | mira fora do sensor ou sensibilidade mal ajustada | alinhar o laser e ajustar o potenciômetro do sensor |
| Com outro módulo: alarme toca com o feixe livre e cala com ele obstruído, e `sensor:` muda normalmente | nível do sensor ao contrário | trocar `nivelObstruido` para `LOW` |
| Com outro buzzer: apita com o feixe livre e cala com ele obstruído, e `feixe:` está certo | nível do buzzer ao contrário | trocar `nivelBuzzerApita` para `HIGH` |
| Alarme toca com a placa de chuva seca e cala com ela molhada | nível do sensor de chuva ao contrário | trocar `nivelChuva` para `HIGH` |
| `DO chuva:` não muda ao molhar a placa | módulo sem energia, placa desconectada do módulo ou sensibilidade mal ajustada | conferir `VCC`, `GND`, os 2 fios da placa e o potenciômetro |
| Alarme de chuva não para depois da chuva | placa ainda úmida, ou trilhas oxidadas | enxugar a placa e limpar as trilhas. Com o uso, a corrosão é normal, e a placa é peça de reposição |
| Gravação falha com a porta ocupada ou acesso negado | Monitor Serial aberto | fechar o Monitor Serial e gravar de novo |
| Servo não chega ao ângulo aberto | tampa pesada ou braço curto | aliviar a tampa, reposicionar o horn ou usar MG996R com fonte externa |

## 📁 Estrutura do projeto

```
arduino-uno-blink/
├── src/
│   └── main.cpp        # Lixeira automatica + barreira a laser + chuva
├── docs/
│   ├── index.html      # Explicação interativa (abra no navegador)
│   ├── estilo.css      # Aparência da página
│   └── app.js          # Simulador, tour pelo código e quiz
├── platformio.ini      # Configuração do PlatformIO (placa, porta, monitor)
├── README.md           # Este arquivo
└── .gitignore          # Arquivos ignorados pelo Git
```
