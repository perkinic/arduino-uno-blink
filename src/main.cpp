// ============================================================
// Projeto: Arduino Uno - Lixeira Automatica + Barreira a Laser + Chuva
// Descricao: um sensor ultrassonico HC-SR04 mede a distancia e um
//            servo motor abre a tampa da lixeira quando alguem se
//            aproxima. Quando a frente fica livre, a tampa fecha.
//            Um laser aponta para um sensor de luz: enquanto o feixe
//            estiver obstruido, o buzzer apita de forma intermitente.
//            Um sensor de chuva aciona o mesmo alarme enquanto estiver
//            molhado.
//
// Pinos: HC-SR04     -> VCC 5V, GND, Trig no pino 4, Echo no pino 5
//        Servo tampa -> sinal (fio amarelo) no pino 9,
//                       VCC no 5V (de preferencia fonte externa),
//                       GND comum com o Arduino
//        Laser       -> sinal no pino 7
//        Sensor luz  -> saida digital no pino 2
//        Sensor chuva-> saida digital DO no pino 3
//        Buzzer      -> sinal no pino 12
//
// ATENCAO: nunca olhe para o feixe do laser nem o aponte para os olhos
//          de alguem ou para superficies que reflitam.
//
// Comando pelo monitor serial (envie a letra e ENTER):
//   l = alternar log rapido / log normal
// ============================================================

#include <Arduino.h>
#include <Servo.h>

// ------------------------- Opcoes --------------------------
// Solta o servo (detach) quando a tampa esta fechada e parada: evita
// o servo tremer, aquecer e puxar corrente do 5V do Uno. Comente se a
// sua tampa PRECISA da forca do servo para permanecer fechada.
#define SERVO_DESCANSAR

// Movimento da tampa:
//  - padrao = velocidade NORMAL do servo (manda direto para o angulo)
//  - descomente a linha abaixo para ir bem devagar, 1 grau por vez
// #define SERVO_DEVAGAR

// ------------------------- Pinos ---------------------------
const int pinoTrig = 4;    // HC-SR04: Trigger
const int pinoEcho = 5;    // HC-SR04: Echo
const int pinoServo = 9;   // servo da tampa
const int pinoSensorLuz = 2;  // sensor de luz: saida digital
const int pinoSensorChuva = 3;  // sensor de chuva: saida digital DO
const int pinoLaser = 7;      // laser
const int pinoBuzzer = 12;    // buzzer

// ------------------------- Ajustes -------------------------
const int anguloFechado = 0;     // tampa apoiada na lixeira
const int anguloAberto = 110;    // tampa levantada

const int distanciaAbrir = 25;   // abre quando algo estiver mais perto (cm)
const int distanciaFechar = 35;  // so fecha acima disso (histerese)
const int distanciaMinima = 2;   // zona morta do HC-SR04

const unsigned long tempoMinimoAberto = 3000;  // fica aberta por no minimo 3 s
const unsigned long intervaloUltrassom = 120;  // HC-SR04 pede >= 60 ms entre pulsos
const int leiturasParaFechar = 3;              // 3 leituras "livre" antes de fechar

// Usado APENAS no modo SERVO_DEVAGAR: ms de espera entre um grau e o
// proximo. 15 ms/grau = 90 graus em ~1,4 s; 25 ms/grau = ~2,3 s.
const unsigned long intervaloServo = 15;

// Tempo com a tampa FECHADA E PARADA ate soltar o servo
const unsigned long tempoParaDescansarServo = 2000;

const unsigned long intervaloLogNormal = 1000;  // log normal: 1 vez por segundo
const unsigned long intervaloLogRapido = 200;   // log rapido: 5 vezes por segundo

// Barreira: nivel do sensor com o feixe obstruido. Se o alarme tocar
// com o feixe livre e calar com ele obstruido, troque para LOW.
const int nivelObstruido = HIGH;

// Chuva: nivel do DO com a placa molhada. Se o alarme tocar com a placa
// seca e calar com ela molhada, troque para HIGH.
const int nivelChuva = LOW;

// Nivel do pino que faz o buzzer apitar. Se ele apitar sem nenhum alarme
// e calar durante o alarme, troque para HIGH.
const int nivelBuzzerApita = LOW;

const unsigned long filtroFeixe = 50;      // leitura estavel por 50 ms vale
const unsigned long filtroChuva = 500;     // gotas fazem o sinal oscilar
const unsigned long intervaloBip = 200;    // 200 ms apitando, 200 ms mudo
const unsigned long esperaLaserLigar = 200;  // sensor reagir ao laser no boot

// ------------------------- Estado --------------------------
Servo tampa;
bool servoAtivo = false;         // true = servo attached (sendo alimentado)
int anguloAtual = anguloFechado; // posicao atual do servo (graus)
int anguloAlvo = anguloFechado;  // para onde o servo esta indo
unsigned long ultimoPassoServo = 0;
unsigned long ultimoMovimentoServo = 0;

bool tampaAberta = false;
unsigned long momentoAbertura = 0;
int contadorSemObjeto = 0;       // leituras "frente livre" seguidas
long distanciaAtual = -1;        // ultima distancia medida (cm); -1 = sem leitura
unsigned long ultimaLeituraUltrassom = 0;

bool feixeObstruido = false;      // estado confirmado da barreira
bool ultimaLeituraFeixe = false;  // leitura mais recente, ainda sem filtro
unsigned long momentoMudancaFeixe = 0;

bool chuvaDetectada = false;      // estado confirmado do sensor de chuva
bool ultimaLeituraChuva = false;  // leitura mais recente, ainda sem filtro
unsigned long momentoMudancaChuva = 0;

bool buzzerApitando = false;
unsigned long ultimaTrocaBip = 0;

bool logRapido = false;
unsigned long ultimoLog = 0;

// ----------------------- Ultrassonico ----------------------

// Mede a distancia (cm) com o HC-SR04.
// Devolve -1 quando nao ha leitura valida (sem eco / sensor solto).
long medirDistancia() {
  digitalWrite(pinoTrig, LOW);
  delayMicroseconds(2);
  digitalWrite(pinoTrig, HIGH);
  delayMicroseconds(10);
  digitalWrite(pinoTrig, LOW);

  // 15000 us de espera = ate ~257 cm; sem eco o pulseIn devolve 0
  unsigned long duracao = pulseIn(pinoEcho, HIGH, 15000);
  if (duracao == 0) {
    return -1;
  }
  return (long)(duracao * 0.034 / 2);   // 0,034 cm/us, ida e volta
}

// -------------------------- Servo --------------------------

// Liga o servo (ele pode estar em descanso). A posicao atual e gravada
// ANTES do attach para o servo nao dar um solavanco.
void garantirServoAtivo() {
  if (!servoAtivo) {
    tampa.write(anguloAtual);
    tampa.attach(pinoServo);
    servoAtivo = true;
  }
}

// Leva o servo ate o angulo alvo sem usar delay(). Com a tampa fechada
// e parada, solta o servo (SERVO_DESCANSAR). Aberta, ele precisa segurar.
void atualizarServo() {
  unsigned long agora = millis();

  if (anguloAtual != anguloAlvo) {
    garantirServoAtivo();

#ifdef SERVO_DEVAGAR
    if (agora - ultimoPassoServo < intervaloServo) {
      return;   // ainda nao e hora do proximo grau
    }
    ultimoPassoServo = agora;
    anguloAtual += (anguloAtual < anguloAlvo) ? 1 : -1;
#else
    anguloAtual = anguloAlvo;
#endif

    tampa.write(anguloAtual);
    ultimoMovimentoServo = agora;
    return;
  }

#ifdef SERVO_DESCANSAR
  if (servoAtivo &&
      anguloAtual == anguloFechado &&
      (agora - ultimoMovimentoServo) >= tempoParaDescansarServo) {
    tampa.detach();
    servoAtivo = false;
    Serial.println(F(">> Servo em descanso (tampa fechada, sem corrente)"));
  }
#endif
}

// ------------------------- Lixeira -------------------------

// Abre a tampa: so define o alvo; quem move e atualizarServo()
void abrirTampa() {
  tampaAberta = true;
  anguloAlvo = anguloAberto;
  momentoAbertura = millis();
  contadorSemObjeto = 0;

  Serial.print(F(">> Obstaculo a "));
  Serial.print(distanciaAtual);
  Serial.println(F(" cm -> abrindo a tampa"));
}

// Fecha a tampa: manda o servo voltar para o angulo fechado
void fecharTampa() {
  tampaAberta = false;
  anguloAlvo = anguloFechado;

  Serial.println(F(">> Frente livre -> fechando a tampa"));
}

// Le o ultrassonico no ritmo certo e decide abrir/fechar a tampa
void atualizarLixeira() {
  unsigned long agora = millis();

  if (agora - ultimaLeituraUltrassom < intervaloUltrassom) {
    return;
  }
  ultimaLeituraUltrassom = agora;

  distanciaAtual = medirDistancia();

  // Leitura invalida (-1) nunca abre a tampa (seguranca)
  bool objetoPerto = (distanciaAtual >= distanciaMinima &&
                      distanciaAtual <= distanciaAbrir);
  bool frenteLivre = (distanciaAtual < 0) ||
                     (distanciaAtual > distanciaFechar);

  if (!tampaAberta) {
    if (objetoPerto) {
      abrirTampa();
    }
    return;
  }

  if (!frenteLivre) {
    contadorSemObjeto = 0;
  } else if (contadorSemObjeto < leiturasParaFechar) {
    contadorSemObjeto++;
  }

  if ((agora - momentoAbertura) >= tempoMinimoAberto &&
      contadorSemObjeto >= leiturasParaFechar) {
    fecharTampa();
  }
}

// ------------------------- Alarme --------------------------

void definirBuzzer(bool apitando) {
  buzzerApitando = apitando;
  digitalWrite(pinoBuzzer, apitando ? nivelBuzzerApita : !nivelBuzzerApita);
}

// Le o feixe a cada volta do loop. Nao ha calibracao nem nada guardado:
// o estado depende apenas do que o sensor mostra agora.
void atualizarBarreira() {
  unsigned long agora = millis();
  bool leitura = (digitalRead(pinoSensorLuz) == nivelObstruido);

  if (leitura != ultimaLeituraFeixe) {
    ultimaLeituraFeixe = leitura;
    momentoMudancaFeixe = agora;
  }

  if (leitura != feixeObstruido && agora - momentoMudancaFeixe >= filtroFeixe) {
    feixeObstruido = leitura;
    Serial.println(feixeObstruido ? F(">> Feixe obstruido -> alarme")
                                  : F(">> Feixe livre"));
  }
}

// Le o sensor de chuva, com o mesmo filtro da barreira
void atualizarChuva() {
  unsigned long agora = millis();
  bool leitura = (digitalRead(pinoSensorChuva) == nivelChuva);

  if (leitura != ultimaLeituraChuva) {
    ultimaLeituraChuva = leitura;
    momentoMudancaChuva = agora;
  }

  if (leitura != chuvaDetectada && agora - momentoMudancaChuva >= filtroChuva) {
    chuvaDetectada = leitura;
    Serial.println(chuvaDetectada ? F(">> Chuva detectada -> alarme")
                                  : F(">> Placa de chuva seca"));
  }
}

// Apita intermitente se qualquer sensor acusar, sem usar delay()
void atualizarBuzzer() {
  if (!feixeObstruido && !chuvaDetectada) {
    if (buzzerApitando) {
      definirBuzzer(false);
    }
    return;
  }

  unsigned long agora = millis();
  if (agora - ultimaTrocaBip >= intervaloBip) {
    ultimaTrocaBip = agora;
    definirBuzzer(!buzzerApitando);
  }
}

// ---------------------- Monitor serial ---------------------

// Mostra a distancia, a tampa, a barreira e a chuva de tempos em tempos
void registrarDiagnostico() {
  unsigned long agora = millis();
  unsigned long intervalo = logRapido ? intervaloLogRapido : intervaloLogNormal;

  if (agora - ultimoLog < intervalo) {
    return;
  }
  ultimoLog = agora;

  Serial.print(F("dist: "));
  if (distanciaAtual < 0) {
    Serial.print(F("--"));
  } else {
    Serial.print(distanciaAtual);
  }
  Serial.print(F(" cm  | tampa: "));
  Serial.print(tampaAberta ? F("ABERTA") : F("FECHADA"));
  Serial.print(servoAtivo ? F(" (servo on)") : F(" (servo off)"));
  Serial.print(F("  | sensor: "));
  Serial.print(digitalRead(pinoSensorLuz) == HIGH ? F("HIGH") : F("LOW"));
  Serial.print(F("  | feixe: "));
  Serial.print(feixeObstruido ? F("OBSTRUIDO") : F("livre"));
  Serial.print(F("  | DO chuva: "));
  Serial.print(digitalRead(pinoSensorChuva) == HIGH ? F("HIGH") : F("LOW"));
  Serial.print(F("  | chuva: "));
  Serial.println(chuvaDetectada ? F("SIM") : F("nao"));
}

// Comando manual pelo monitor serial: l = log rapido/normal
void tratarComandoSerial() {
  while (Serial.available() > 0) {
    char comando = (char)Serial.read();

    if (comando == 'l' || comando == 'L') {
      logRapido = !logRapido;
      ultimoLog = 0;
      Serial.print(F(">> Log "));
      Serial.println(logRapido ? F("RAPIDO (5/s)") : F("normal (1/s)"));

    } else if (comando != '\n' && comando != '\r') {
      Serial.println(F(">> Comando: l=log rapido/normal"));
    }
  }
}

// ------------------------- SETUP ---------------------------

void setup() {
  Serial.begin(9600);

  pinMode(pinoTrig, OUTPUT);
  pinMode(pinoEcho, INPUT);

  // Grava o nivel antes do pinMode para o buzzer nao apitar no boot
  definirBuzzer(false);
  pinMode(pinoBuzzer, OUTPUT);

  pinMode(pinoSensorLuz, INPUT);

  // Com o pull-up, o pino le "seco" se o sensor de chuva estiver solto
  pinMode(pinoSensorChuva, INPUT_PULLUP);

  pinMode(pinoLaser, OUTPUT);
  digitalWrite(pinoLaser, HIGH);
  delay(esperaLaserLigar);

  // Comeca com a tampa fechada; o descanso solta o servo depois
  garantirServoAtivo();
  ultimoMovimentoServo = millis();

  Serial.println(F("=========================================="));
  Serial.println(F("  Arduino Uno - Lixeira + Barreira + Chuva"));
  Serial.println(F("=========================================="));
  Serial.print(F("Abre com obstaculo a ate "));
  Serial.print(distanciaAbrir);
  Serial.print(F(" cm  |  servo: "));
  Serial.print(anguloFechado);
  Serial.print(F(" -> "));
  Serial.print(anguloAberto);
  Serial.println(F(" graus"));
  Serial.println(F("Comando no serial: l=log rapido/normal"));
  Serial.println(F("------------------------------------------"));
}

// ------------------------- LOOP ----------------------------

void loop() {
  tratarComandoSerial();
  atualizarLixeira();      // le o ultrassonico e decide abrir/fechar a tampa
  atualizarServo();        // leva o servo ao angulo alvo (e descansa quando fechado)
  atualizarBarreira();     // le o feixe do laser
  atualizarChuva();        // le o sensor de chuva
  atualizarBuzzer();       // apita intermitente se algum sensor acusar
  registrarDiagnostico();
}
