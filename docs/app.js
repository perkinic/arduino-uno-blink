"use strict";

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// Simulador: mesma logica e mesmos tempos de src/main.cpp
// ------------------------------------------------------------

const AJUSTES = {
  anguloAberto: 110,
  distanciaAbrir: 25,
  distanciaFechar: 35,
  distanciaMinima: 2,
  tempoMinimoAberto: 3000,
  intervaloUltrassom: 120,
  leiturasParaFechar: 3,
  tempoParaDescansarServo: 2000,
  filtroFeixe: 50,
  filtroChuva: 500,
  intervaloBip: 200,
  intervaloLog: 1000,
  esperaLaserLigar: 200,
};

const PASSO_MS = 5;
const MAX_LINHAS_SERIAL = 80;

const entradas = { obstruido: false, molhado: false, distancia: 184 };
let velocidade = 1;
let somLigado = false;
let audio = null;
let s = null;
let linhasSerial = [];
let anguloVisivel = 0;

function imprimir(texto) {
  linhasSerial.push(texto);
  if (linhasSerial.length > MAX_LINHAS_SERIAL) {
    linhasSerial.shift();
  }
  const caixa = $("serial");
  const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 30;
  caixa.textContent = linhasSerial.join("\n");
  if (noFim) {
    caixa.scrollTop = caixa.scrollHeight;
  }
}

function iniciarArduino() {
  const inicio = AJUSTES.esperaLaserLigar;
  s = {
    t: inicio,
    feixeObstruido: false, ultimaLeituraFeixe: false, mudancaFeixe: 0,
    chuva: false, ultimaLeituraChuva: false, mudancaChuva: 0,
    apitando: false, ultimaTrocaBip: 0,
    tampaAberta: false, momentoAbertura: 0, semObjeto: 0,
    distancia: -1, ultimaLeituraUltrassom: 0,
    anguloAtual: 0, anguloAlvo: 0, servoAtivo: true, ultimoMovimento: inicio,
    ultimoLog: 0, pulsoFeixeAte: 0, pulsoChuvaAte: 0,
  };
  imprimir("==========================================");
  imprimir("  Arduino Uno - Lixeira + Barreira + Chuva");
  imprimir("==========================================");
  imprimir("Abre com obstaculo a ate 25 cm  |  servo: 0 -> 110 graus");
  imprimir("Comando no serial: l=log rapido/normal");
  imprimir("------------------------------------------");
}

const leituraFeixe = () => entradas.obstruido || s.t < s.pulsoFeixeAte;
const leituraChuva = () => entradas.molhado || s.t < s.pulsoChuvaAte;

function atualizarLixeira() {
  if (s.t - s.ultimaLeituraUltrassom < AJUSTES.intervaloUltrassom) {
    return;
  }
  s.ultimaLeituraUltrassom = s.t;
  s.distancia = entradas.distancia;

  const objetoPerto = s.distancia >= AJUSTES.distanciaMinima && s.distancia <= AJUSTES.distanciaAbrir;
  const frenteLivre = s.distancia < 0 || s.distancia > AJUSTES.distanciaFechar;

  if (!s.tampaAberta) {
    if (objetoPerto) {
      s.tampaAberta = true;
      s.anguloAlvo = AJUSTES.anguloAberto;
      s.momentoAbertura = s.t;
      s.semObjeto = 0;
      imprimir(`>> Obstaculo a ${s.distancia} cm -> abrindo a tampa`);
    }
    return;
  }

  if (!frenteLivre) {
    s.semObjeto = 0;
  } else if (s.semObjeto < AJUSTES.leiturasParaFechar) {
    s.semObjeto++;
  }

  if (s.t - s.momentoAbertura >= AJUSTES.tempoMinimoAberto && s.semObjeto >= AJUSTES.leiturasParaFechar) {
    s.tampaAberta = false;
    s.anguloAlvo = 0;
    imprimir(">> Frente livre -> fechando a tampa");
  }
}

function atualizarServo() {
  if (s.anguloAtual !== s.anguloAlvo) {
    s.servoAtivo = true;
    s.anguloAtual = s.anguloAlvo;
    s.ultimoMovimento = s.t;
    return;
  }
  if (s.servoAtivo && s.anguloAtual === 0 && s.t - s.ultimoMovimento >= AJUSTES.tempoParaDescansarServo) {
    s.servoAtivo = false;
    imprimir(">> Servo em descanso (tampa fechada, sem corrente)");
  }
}

function atualizarBarreira() {
  const leitura = leituraFeixe();
  if (leitura !== s.ultimaLeituraFeixe) {
    s.ultimaLeituraFeixe = leitura;
    s.mudancaFeixe = s.t;
  }
  if (leitura !== s.feixeObstruido && s.t - s.mudancaFeixe >= AJUSTES.filtroFeixe) {
    s.feixeObstruido = leitura;
    imprimir(s.feixeObstruido ? ">> Feixe obstruido -> alarme" : ">> Feixe livre");
  }
}

function atualizarChuva() {
  const leitura = leituraChuva();
  if (leitura !== s.ultimaLeituraChuva) {
    s.ultimaLeituraChuva = leitura;
    s.mudancaChuva = s.t;
  }
  if (leitura !== s.chuva && s.t - s.mudancaChuva >= AJUSTES.filtroChuva) {
    s.chuva = leitura;
    imprimir(s.chuva ? ">> Chuva detectada -> alarme" : ">> Placa de chuva seca");
  }
}

function atualizarBuzzer() {
  if (!s.feixeObstruido && !s.chuva) {
    s.apitando = false;
    return;
  }
  if (s.t - s.ultimaTrocaBip >= AJUSTES.intervaloBip) {
    s.ultimaTrocaBip = s.t;
    s.apitando = !s.apitando;
  }
}

function registrarDiagnostico() {
  if (s.t - s.ultimoLog < AJUSTES.intervaloLog) {
    return;
  }
  s.ultimoLog = s.t;
  const dist = s.distancia < 0 ? "--" : s.distancia;
  imprimir(
    `dist: ${dist} cm  | tampa: ${s.tampaAberta ? "ABERTA" : "FECHADA"}` +
    `${s.servoAtivo ? " (servo on)" : " (servo off)"}` +
    `  | sensor: ${leituraFeixe() ? "HIGH" : "LOW"}` +
    `  | feixe: ${s.feixeObstruido ? "OBSTRUIDO" : "livre"}` +
    `  | DO chuva: ${leituraChuva() ? "LOW" : "HIGH"}` +
    `  | chuva: ${s.chuva ? "SIM" : "nao"}`
  );
}

function umaVoltaDoLoop() {
  atualizarLixeira();
  atualizarServo();
  atualizarBarreira();
  atualizarChuva();
  atualizarBuzzer();
  registrarDiagnostico();
}

function nivel(celula, valor) {
  celula.textContent = valor;
  celula.className = valor === "HIGH" ? "alto" : valor === "LOW" ? "baixo" : "";
}

let resumoAnterior = "";

function desenharSimulador() {
  const feixeCortado = leituraFeixe();
  const molhada = leituraChuva();

  $("mao").classList.toggle("oculto", !feixeCortado);
  $("feixe").setAttribute("x2", feixeCortado ? "380" : "690");

  anguloVisivel += (s.anguloAtual - anguloVisivel) * 0.2;
  $("tampa").setAttribute("transform", `rotate(${-anguloVisivel.toFixed(1)} 44 188)`);

  const x = 176 + entradas.distancia * 1.3;
  $("pessoa").setAttribute("cx", x);
  $("pessoaTxt").setAttribute("x", x);
  $("pessoaTxt").textContent = `${entradas.distancia} cm`;

  $("placa").classList.toggle("molhada", molhada);
  $("gotas").classList.toggle("oculto", !molhada);
  $("ondas").classList.toggle("oculto", !s.apitando);
  $("buzzerCorpo").classList.toggle("tocando", s.apitando);

  nivel($("p2"), feixeCortado ? "HIGH" : "LOW");
  nivel($("p3"), molhada ? "LOW" : "HIGH");
  nivel($("p7"), "HIGH");
  nivel($("p9"), s.servoAtivo ? "pulsos" : "solto");
  nivel($("p12"), s.apitando ? "LOW" : "HIGH");

  const motivos = [];
  if (s.feixeObstruido) motivos.push("feixe obstruído");
  if (s.chuva) motivos.push("chuva");
  const alarme = motivos.length > 0;
  const texto = alarme
    ? `Alarme tocando: ${motivos.join(" e ")}.`
    : `Tudo normal. Tampa ${s.tampaAberta ? "aberta" : "fechada"}.`;
  if (texto !== resumoAnterior) {
    $("resumo").textContent = texto;
    $("resumo").classList.toggle("alarme", alarme);
    resumoAnterior = texto;
  }

  if (audio) {
    audio.ganho.gain.value = somLigado && s.apitando ? 0.04 : 0;
  }
}

let ultimoQuadro = 0;
let sobra = 0;

function quadro(agora) {
  const passou = Math.min(agora - ultimoQuadro, 100);
  ultimoQuadro = agora;
  sobra += passou * velocidade;
  while (sobra >= PASSO_MS) {
    sobra -= PASSO_MS;
    s.t += PASSO_MS;
    umaVoltaDoLoop();
  }
  desenharSimulador();
  atualizarGrafico(passou);
  requestAnimationFrame(quadro);
}

function alternar(botao, aoMudar, textoLigado, textoDesligado) {
  botao.addEventListener("click", () => {
    const ligado = botao.getAttribute("aria-pressed") !== "true";
    botao.setAttribute("aria-pressed", String(ligado));
    if (textoLigado) {
      botao.textContent = ligado ? textoLigado : textoDesligado;
    }
    aoMudar(ligado);
  });
}

function ligarControles() {
  alternar($("btFeixe"), (v) => { entradas.obstruido = v; }, "Liberar o feixe", "Obstruir o feixe");
  alternar($("btChuva"), (v) => { entradas.molhado = v; }, "Secar a placa", "Molhar a placa");
  alternar($("btLento"), (v) => { velocidade = v ? 0.1 : 1; });
  alternar($("btSom"), (v) => {
    somLigado = v;
    if (v && !audio) {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (Contexto) {
        const ctx = new Contexto();
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 2300;
        ganho.gain.value = 0;
        osc.connect(ganho).connect(ctx.destination);
        osc.start();
        audio = { ctx, ganho };
      }
    }
  }, "Desligar som", "Ligar som");

  $("btPulsoFeixe").addEventListener("click", () => { s.pulsoFeixeAte = s.t + 30; });
  $("btPulsoChuva").addEventListener("click", () => { s.pulsoChuvaAte = s.t + 200; });
  $("btReset").addEventListener("click", () => {
    imprimir("");
    iniciarArduino();
  });
  $("distancia").addEventListener("input", (e) => {
    entradas.distancia = Number(e.target.value);
    $("distanciaTxt").textContent = `${entradas.distancia} cm`;
  });
}

// ------------------------------------------------------------
// Grafico do filtro
// ------------------------------------------------------------

const JANELA_GRAFICO = 5000;
const grafico = {
  amostras: [{ t: -5000, bruto: false, confirmado: false }], segurando: false, bruto: false, confirmado: false,
  ultimaLeitura: false, tempo: 0, mudanca: 0, proximaTremida: 0, filtro: 500, alarmes: 0,
};

function atualizarGrafico(passou) {
  const g = grafico;
  g.tempo += passou;

  if (!g.segurando) {
    g.bruto = false;
  } else if (g.tempo >= g.proximaTremida) {
    g.bruto = !g.bruto;
    if (g.tempo < g.inicioToque + 600) {
      g.proximaTremida = g.tempo + 40 + Math.random() * 90;
    } else {
      g.bruto = true;
      g.proximaTremida = Infinity;
    }
  }

  if (g.bruto !== g.ultimaLeitura) {
    g.ultimaLeitura = g.bruto;
    g.mudanca = g.tempo;
  }
  if (g.bruto !== g.confirmado && g.tempo - g.mudanca >= g.filtro) {
    g.confirmado = g.bruto;
    if (g.confirmado) {
      g.alarmes++;
      $("contaAlarmes").textContent = g.alarmes;
    }
  }

  g.amostras.push({ t: g.tempo, bruto: g.bruto, confirmado: g.confirmado });
  while (g.amostras.length > 2 && g.amostras[0].t < g.tempo - JANELA_GRAFICO) {
    g.amostras.shift();
  }

  const pontos = (campo, alto, baixo) => {
    let texto = "";
    let anterior = null;
    for (const a of g.amostras) {
      const x = (800 - ((g.tempo - a.t) / JANELA_GRAFICO) * 800).toFixed(1);
      const y = a[campo] ? alto : baixo;
      if (anterior !== null && anterior !== y) {
        texto += `${x},${anterior} `;
      }
      texto += `${x},${y} `;
      anterior = y;
    }
    return texto;
  };
  $("linhaBruta").setAttribute("points", pontos("bruto", 34, 96));
  $("linhaFiltrada").setAttribute("points", pontos("confirmado", 138, 204));
}

function ligarGrafico() {
  const botao = $("btSegurar");
  const comecar = () => {
    if (!grafico.segurando) {
      grafico.segurando = true;
      grafico.inicioToque = grafico.tempo;
      grafico.proximaTremida = grafico.tempo;
    }
  };
  const parar = () => { grafico.segurando = false; };

  botao.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    botao.setPointerCapture(e.pointerId);
    comecar();
  });
  botao.addEventListener("pointerup", parar);
  botao.addEventListener("pointercancel", parar);
  botao.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      comecar();
    }
  });
  botao.addEventListener("keyup", parar);
  botao.addEventListener("blur", parar);

  $("filtroTempo").addEventListener("input", (e) => {
    grafico.filtro = Number(e.target.value);
    $("filtroTxt").textContent = `${grafico.filtro} ms`;
  });
}

// ------------------------------------------------------------
// Mapa de pinos
// ------------------------------------------------------------

const PINOS = {
  "2": { tipo: "usado", titulo: "Pino 2: sensor de luz", texto: "Recebe a saída digital <code>DO</code> do sensor de luz. <code>LOW</code> quer dizer que o feixe está chegando, e <code>HIGH</code> quer dizer que ele foi obstruído." },
  "3": { tipo: "usado", titulo: "Pino 3: sensor de chuva", texto: "Recebe a saída <code>DO</code> do módulo de chuva. <code>LOW</code> quer dizer placa molhada. O programa usa <code>INPUT_PULLUP</code>: com o fio solto, o pino lê seco e não dá alarme falso." },
  "4": { tipo: "usado", titulo: "Pino 4: Trig do HC-SR04", texto: "É uma saída. Um pulso de 10 microssegundos manda o sensor emitir o ultrassom." },
  "5": { tipo: "usado", titulo: "Pino 5: Echo do HC-SR04", texto: "É uma entrada. O tempo que ele fica em <code>HIGH</code> mostra quanto o som demorou para ir e voltar." },
  "7": { tipo: "usado", titulo: "Pino 7: laser", texto: "É uma saída. Fica em <code>HIGH</code> o tempo todo para manter o laser ligado." },
  "9": { tipo: "usado", titulo: "Pino 9: servo da tampa", texto: "Envia os pulsos que definem o ângulo do servo: 0° fechada e 110° aberta. Com a tampa fechada e parada há 2 s, o programa solta o servo." },
  "12": { tipo: "usado", titulo: "Pino 12: buzzer", texto: "Este buzzer apita quando o pino vai para <code>LOW</code>. Por isso ele fica em <code>HIGH</code> quando está mudo." },
  "13": { tipo: "armadilha", titulo: "Pino 13: não usado, mas cuidado", texto: "O programa não usa este pino. Ele fica colado no GND da fileira digital, então é fácil ligar um fio aqui por engano. Depois do reset, o bootloader mexe neste pino por cerca de 1 segundo." },
  "GNDd": { tipo: "terra armadilha", titulo: "GND da fileira digital", texto: "É um terra normal, igual aos outros. O risco é errar por um furo e cair no pino 13 ou no AREF. Foi nessa região que estava o fio do defeito real deste projeto." },
  "5V": { tipo: "alimenta", titulo: "5V", texto: "Alimenta os módulos: HC-SR04, sensor de luz e sensor de chuva. O laser e o buzzer usam este pino se tiverem <code>VCC</code>. Se for um servo grande, use uma fonte externa com GND comum." },
  "GND1": { tipo: "terra", titulo: "GND da fileira POWER", texto: "É o terra de referência para os módulos. Todo o circuito precisa compartilhar o mesmo GND, inclusive uma fonte externa, se houver." },
  "GND2": { tipo: "terra", titulo: "GND da fileira POWER", texto: "É o terra de referência para os módulos. Todo o circuito precisa compartilhar o mesmo GND, inclusive uma fonte externa, se houver." },
};

const FILEIRA_DIGITAL = [
  ["AREF"], ["GND", "GNDd"], ["13", "13"], ["12", "12"], ["11"], ["10"], ["9", "9"], ["8"],
  ["7", "7"], ["6"], ["5", "5"], ["4", "4"], ["3", "3"], ["2", "2"], ["1"], ["0"],
];
const FILEIRA_POWER = [
  ["IOREF"], ["RESET"], ["3.3V"], ["5V", "5V"], ["GND", "GND1"], ["GND", "GND2"], ["VIN"],
];

function montarFileira(caixa, pinos) {
  for (const [nome, chave] of pinos) {
    if (!chave) {
      const livre = document.createElement("div");
      livre.className = "pino";
      livre.textContent = nome;
      caixa.append(livre);
      continue;
    }
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = `pino ${PINOS[chave].tipo}`;
    botao.textContent = nome;
    botao.dataset.chave = chave;
    botao.setAttribute("aria-pressed", "false");
    botao.addEventListener("click", () => mostrarPino(chave));
    caixa.append(botao);
  }
}

function mostrarPino(chave) {
  document.querySelectorAll("button.pino").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.chave === chave));
  });
  const pino = PINOS[chave];
  $("pinoInfo").innerHTML = `<h3>${pino.titulo}</h3><p>${pino.texto}</p>`;
}

// ------------------------------------------------------------
// Sensores
// ------------------------------------------------------------

const SENSORES = [
  {
    nome: "HC-SR04",
    html: `<h3>Sensor ultrassônico HC-SR04</h3>
    <div class="colunas"><div>
      <p>Funciona como um morcego: emite um som agudo demais para ouvirmos e mede quanto tempo o eco demora para voltar.</p>
      <ol class="passos">
        <li>O Arduino envia um pulso de 10 µs no pino <code>Trig</code>.</li>
        <li>O sensor emite o ultrassom.</li>
        <li>O pino <code>Echo</code> fica em <code>HIGH</code> até o eco voltar.</li>
        <li>O Arduino converte esse tempo em distância.</li>
      </ol>
      <div class="calc">
        <label for="calcDist">Objeto a <output id="calcDistTxt">25 cm</output></label>
        <input id="calcDist" type="range" min="2" max="200" value="25">
        <p>Eco de <output id="calcTempo"></output></p>
        <p><output id="calcConta"></output></p>
      </div>
    </div><div>
      <dl class="ficha">
        <dt>Pinos</dt><dd>Trig no 4, Echo no 5</dd>
        <dt>Regra no projeto</dt><dd>Abre a até 25 cm e só fecha acima de 35 cm</dd>
        <dt>Por que dividir por 2?</dt><dd>O som vai até o objeto e volta. A distância é só metade do caminho.</dd>
        <dt>Ritmo</dt><dd>Uma medição a cada 120 ms, para o eco anterior não atrapalhar</dd>
      </dl>
    </div></div>`,
  },
  {
    nome: "Servo",
    html: `<h3>Servo motor</h3>
    <div class="colunas"><div>
      <p>É um motor que vai até um ângulo e fica lá. O Arduino diz qual ângulo quer por meio de pulsos, e o circuito dentro do servo faz o resto.</p>
      <ol class="passos">
        <li>O programa define o ângulo alvo.</li>
        <li><code>tampa.write(110)</code> leva a tampa até a posição aberta.</li>
        <li>Com a tampa fechada e parada há 2 s, <code>tampa.detach()</code> solta o servo.</li>
      </ol>
      <p>Soltar o servo evita que ele trema, aqueça e consuma corrente à toa.</p>
    </div><div>
      <dl class="ficha">
        <dt>Pino</dt><dd>Sinal no 9</dd>
        <dt>Ângulos</dt><dd>0° fechada e 110° aberta</dd>
        <dt>Tempo mínimo aberta</dt><dd>3 segundos</dd>
        <dt>Atenção</dt><dd>Servos puxam bastante corrente. Se o Arduino reiniciar ao girar, use fonte externa com GND comum.</dd>
      </dl>
    </div></div>`,
  },
  {
    nome: "Laser e sensor de luz",
    html: `<h3>Barreira a laser</h3>
    <div class="colunas"><div>
      <p>O laser só emite luz. Quem percebe o corte é o sensor de luz, que fica de frente para ele.</p>
      <ol class="passos">
        <li>O sensor mede a luz que chega nele.</li>
        <li>Um comparador no módulo confere se a luz passou do limite ajustado no potenciômetro.</li>
        <li>A saída <code>DO</code> entrega um sinal digital simples: <code>LOW</code> com feixe e <code>HIGH</code> sem feixe.</li>
      </ol>
      <p>O Arduino não precisa medir a luz. Ele só lê um pino, que vale <code>HIGH</code> ou <code>LOW</code>.</p>
    </div><div>
      <dl class="ficha">
        <dt>Pinos</dt><dd>Laser no 7, <code>DO</code> do sensor no 2</dd>
        <dt>Filtro</dt><dd>50 ms: uma obstrução mais curta é ignorada</dd>
        <dt>Sem calibração</dt><dd>O programa não guarda nada. Um reset com o feixe obstruído não muda a lógica.</dd>
        <dt>Segurança</dt><dd>Nunca olhe para o feixe. Confira a mira de lado.</dd>
      </dl>
    </div></div>`,
  },
  {
    nome: "Sensor de chuva",
    html: `<h3>Sensor de chuva</h3>
    <div class="colunas"><div>
      <p>A placa tem trilhas de metal bem próximas, sem contato entre si. A água conduz eletricidade e faz uma ponte entre elas.</p>
      <ol class="passos">
        <li>Placa seca: quase nenhuma corrente passa pelas trilhas.</li>
        <li>Placa molhada: a água liga as trilhas e a resistência cai.</li>
        <li>O comparador do módulo percebe a queda e leva <code>DO</code> para <code>LOW</code>.</li>
      </ol>
      <p>O alarme só para depois que a placa secar. Enxugar a placa acelera isso.</p>
    </div><div>
      <dl class="ficha">
        <dt>Pino</dt><dd><code>DO</code> no 3. O pino <code>AO</code> não é usado.</dd>
        <dt>Filtro</dt><dd>500 ms, porque as gotas fazem o sinal oscilar</dd>
        <dt>Atenção</dt><dd>Só a placa pode molhar. O módulo com os 4 pinos fica seco.</dd>
        <dt>Desgaste</dt><dd>Com o uso, as trilhas oxidam. É normal, e a placa é peça de reposição.</dd>
      </dl>
    </div></div>`,
  },
  {
    nome: "Buzzer",
    html: `<h3>Buzzer ativo</h3>
    <div class="colunas"><div>
      <p>Um buzzer ativo tem um oscilador interno: basta acionar o sinal e ele apita. O programa só liga e desliga, sem precisar gerar frequência.</p>
      <p>O apito intermitente vem de alternar o estado a cada 200 ms: 200 ms apitando e 200 ms mudo.</p>
      <p>Ele toca se o feixe estiver obstruído <strong>ou</strong> se houver chuva, e só para quando os dois estiverem normais.</p>
    </div><div>
      <dl class="ficha">
        <dt>Pino</dt><dd>Sinal no 12</dd>
        <dt>Lógica invertida</dt><dd>Este buzzer apita com o pino em <code>LOW</code>, e fica mudo em <code>HIGH</code>.</dd>
        <dt>Detalhe no boot</dt><dd>O programa grava o nível antes do <code>pinMode</code>, para o buzzer não dar um bip ao ligar.</dd>
      </dl>
    </div></div>`,
  },
];

function atualizarCalculo() {
  const distancia = Number($("calcDist").value);
  const tempo = Math.round((distancia * 2) / 0.034);
  $("calcDistTxt").textContent = `${distancia} cm`;
  $("calcTempo").textContent = `${tempo} µs`;
  $("calcConta").textContent = `${tempo} × 0,034 ÷ 2 = ${Math.round((tempo * 0.034) / 2)} cm`;
}

function mostrarSensor(indice, focar) {
  const abas = [...document.querySelectorAll(".aba")];
  abas.forEach((aba, i) => {
    aba.setAttribute("aria-selected", String(i === indice));
    aba.tabIndex = i === indice ? 0 : -1;
  });
  if (focar) {
    abas[indice].focus();
  }
  $("painelSensor").innerHTML = SENSORES[indice].html;
  if ($("calcDist")) {
    $("calcDist").addEventListener("input", atualizarCalculo);
    atualizarCalculo();
  }
}

function montarSensores() {
  const caixa = $("abasSensores");
  SENSORES.forEach((sensor, i) => {
    const aba = document.createElement("button");
    aba.type = "button";
    aba.className = "aba";
    aba.setAttribute("role", "tab");
    aba.textContent = sensor.nome;
    aba.addEventListener("click", () => mostrarSensor(i));
    aba.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") mostrarSensor((i + 1) % SENSORES.length, true);
      if (e.key === "ArrowLeft") mostrarSensor((i - 1 + SENSORES.length) % SENSORES.length, true);
    });
    caixa.append(aba);
  });
  mostrarSensor(0);
}

// ------------------------------------------------------------
// Tour do codigo: trechos copiados de src/main.cpp
// ------------------------------------------------------------

const TOUR = [
  {
    nome: "setup()",
    texto: "Roda uma vez, ao ligar. Prepara os pinos: o buzzer recebe o nível de mudo antes de virar saída, para não apitar no boot. Depois o laser acende, e o programa espera 200 ms para o sensor reagir. Este trecho mostra só a parte dos sensores: o setup() real também prepara o HC-SR04, o servo e o monitor serial.",
    marcar: [2, 3, 5, 8, 11, 12],
    codigo: `void setup() {
  // Grava o nivel antes do pinMode para o buzzer nao apitar no boot
  definirBuzzer(false);
  pinMode(pinoBuzzer, OUTPUT);

  pinMode(pinoSensorLuz, INPUT);

  // Com o pull-up, o pino le "seco" se o sensor de chuva estiver solto
  pinMode(pinoSensorChuva, INPUT_PULLUP);

  pinMode(pinoLaser, OUTPUT);
  digitalWrite(pinoLaser, HIGH);
  delay(esperaLaserLigar);
}`,
  },
  {
    nome: "loop()",
    texto: "Este é o coração do programa. O Arduino repete estas funções para sempre, muito rápido. Nenhuma delas fica parada esperando, então todos os sistemas parecem rodar ao mesmo tempo.",
    marcar: [2, 3, 4, 5, 6],
    codigo: `void loop() {
  tratarComandoSerial();
  atualizarLixeira();      // le o ultrassonico e decide abrir/fechar a tampa
  atualizarServo();        // leva o servo ao angulo alvo (e descansa quando fechado)
  atualizarBarreira();     // le o feixe do laser
  atualizarChuva();        // le o sensor de chuva
  atualizarBuzzer();       // apita intermitente se algum sensor acusar
  registrarDiagnostico();
}`,
  },
  {
    nome: "medirDistancia()",
    texto: "Envia o pulso de 10 µs e mede o tempo do eco com pulseIn. Se nada voltar em 15 ms, devolve -1, que significa leitura inválida. A última linha converte tempo em centímetros.",
    marcar: [3, 4, 5, 8, 12],
    codigo: `long medirDistancia() {
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
}`,
  },
  {
    nome: "atualizarLixeira()",
    texto: "Só mede a cada 120 ms. Abrir exige algo a até 25 cm, mas fechar exige mais de 35 cm. Essa folga se chama histerese e evita que a tampa fique abrindo e fechando. Para fechar, também precisa de 3 leituras livres e de 3 s aberta.",
    marcar: [3, 10, 11, 12, 13, 28, 29],
    codigo: `void atualizarLixeira() {
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
}`,
  },
  {
    nome: "atualizarBarreira()",
    texto: "Primeiro lê o pino. Se a leitura mudou, anota o momento. O estado confirmado só muda quando a leitura diferente já dura 50 ms. Assim, um tremor rápido do sensor é ignorado.",
    marcar: [2, 4, 5, 6, 9, 10],
    codigo: `void atualizarBarreira() {
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
}`,
  },
  {
    nome: "atualizarChuva()",
    texto: "É a mesma ideia da barreira, com outro pino e com filtro de 500 ms. Repare que a função não toca o buzzer: ela só atualiza a variável chuvaDetectada.",
    marcar: [2, 9, 10],
    codigo: `void atualizarChuva() {
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
}`,
  },
  {
    nome: "atualizarBuzzer()",
    texto: "Aqui os dois sensores se encontram. Se nenhum acusar, o buzzer fica mudo. Se pelo menos um acusar, o programa inverte o buzzer a cada 200 ms. Essa inversão é o que cria o som intermitente.",
    marcar: [1, 2, 3, 9, 10, 11],
    codigo: `void atualizarBuzzer() {
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
}`,
  },
];

const PALAVRAS = /^(void|bool|int|long|unsigned|const|if|else|return|true|false|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP)$/;
const TOKENS = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|\b([A-Za-z_]\w*)\b|\b(\d+(?:\.\d+)?)\b/g;

function escapar(texto) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorir(linha) {
  let saida = "";
  let posicao = 0;
  for (const m of linha.matchAll(TOKENS)) {
    saida += escapar(linha.slice(posicao, m.index));
    const texto = escapar(m[0]);
    if (m[1]) saida += `<span class="c">${texto}</span>`;
    else if (m[2]) saida += `<span class="s">${texto}</span>`;
    else if (m[4]) saida += `<span class="n">${texto}</span>`;
    else if (PALAVRAS.test(m[3])) saida += `<span class="k">${texto}</span>`;
    else saida += texto;
    posicao = m.index + m[0].length;
  }
  return saida + escapar(linha.slice(posicao));
}

let passoTour = 0;

function mostrarPasso(indice) {
  passoTour = indice;
  const passo = TOUR[indice];
  $("tourTitulo").textContent = passo.nome;
  $("tourTexto").textContent = passo.texto;
  $("tourCodigo").innerHTML = passo.codigo.split("\n").map((linha, i) => {
    const classe = passo.marcar.includes(i) ? "ln marcada" : "ln";
    return `<span class="${classe}">${colorir(linha) || " "}</span>`;
  }).join("");
  $("tourCodigo").scrollLeft = 0;
  $("tourPasso").textContent = `Passo ${indice + 1} de ${TOUR.length}`;
  $("tourVoltar").disabled = indice === 0;
  $("tourAvancar").disabled = indice === TOUR.length - 1;
  document.querySelectorAll("#tourLista button").forEach((b, i) => {
    if (i === indice) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
}

function montarTour() {
  TOUR.forEach((passo, i) => {
    const item = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = passo.nome;
    botao.addEventListener("click", () => mostrarPasso(i));
    item.append(botao);
    $("tourLista").append(item);
  });
  $("tourVoltar").addEventListener("click", () => mostrarPasso(passoTour - 1));
  $("tourAvancar").addEventListener("click", () => mostrarPasso(passoTour + 1));
  mostrarPasso(0);
}

// ------------------------------------------------------------
// Quiz
// ------------------------------------------------------------

const QUIZ = [
  {
    pergunta: "Uma gota molha a placa por 200 ms e seca. O que acontece?",
    opcoes: ["O alarme toca por 200 ms", "O alarme toca até reiniciar o Arduino", "Nada: o filtro exige 500 ms estáveis"],
    certa: 2,
    explica: "O filtro ignora mudanças que não duram o tempo mínimo. Experimente no simulador.",
  },
  {
    pergunta: "O feixe está obstruído e a placa está molhada. Você libera o feixe. E o buzzer?",
    opcoes: ["Continua apitando, porque ainda há chuva", "Para na hora", "Toca em um ritmo diferente"],
    certa: 0,
    explica: "O buzzer só para quando os dois sensores estiverem normais.",
  },
  {
    pergunta: "A tampa está fechada e alguém para a 30 cm. O que acontece?",
    opcoes: ["A tampa abre", "A tampa continua fechada", "A tampa abre e fecha sem parar"],
    certa: 1,
    explica: "Para abrir, é preciso estar a até 25 cm. Entre 25 e 35 cm, a tampa fica como está.",
  },
  {
    pergunta: "Em que nível o pino 12 precisa estar para este buzzer apitar?",
    opcoes: ["HIGH", "LOW", "Tanto faz"],
    certa: 1,
    explica: "Este buzzer tem lógica invertida: apita em LOW e fica mudo em HIGH.",
  },
  {
    pergunta: "Por que o programa usa millis() em vez de delay() no apito?",
    opcoes: ["Para o buzzer ficar mais alto", "Para economizar memória", "Para o Arduino continuar lendo os sensores enquanto apita"],
    certa: 2,
    explica: "delay() para tudo. Com millis(), o programa só confere o relógio e segue em frente.",
  },
  {
    pergunta: "Você aperta o reset com o feixe obstruído. O que acontece?",
    opcoes: ["A lógica da barreira inverte", "O alarme volta a tocar logo depois do boot", "O sensor precisa ser calibrado de novo"],
    certa: 1,
    explica: "O programa não guarda nada: depois do boot, ele só lê o que o sensor mostra.",
  },
];

let acertos = 0;
let respondidas = 0;

function montarQuiz() {
  QUIZ.forEach((item, q) => {
    const caixa = document.createElement("div");
    caixa.className = "pergunta";
    const titulo = document.createElement("h3");
    titulo.textContent = `${q + 1}. ${item.pergunta}`;
    const opcoes = document.createElement("div");
    opcoes.className = "opcoes";
    const explica = document.createElement("p");
    explica.className = "explica oculto";
    explica.textContent = item.explica;

    item.opcoes.forEach((texto, i) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "botao";
      botao.textContent = texto;
      botao.addEventListener("click", () => {
        const botoes = [...opcoes.children];
        botoes.forEach((b) => { b.disabled = true; });
        botoes[item.certa].classList.add("certa");
        if (i !== item.certa) {
          botao.classList.add("errada");
        } else {
          acertos++;
        }
        respondidas++;
        explica.classList.remove("oculto");
        if (respondidas === QUIZ.length) {
          $("quizPlacar").textContent = `Resultado: ${acertos} de ${QUIZ.length} acertos.`;
        }
      });
      opcoes.append(botao);
    });

    caixa.append(titulo, opcoes, explica);
    $("quizCaixa").append(caixa);
  });
}

// ------------------------------------------------------------

iniciarArduino();
ligarControles();
ligarGrafico();
montarFileira($("fileiraDigital"), FILEIRA_DIGITAL);
montarFileira($("fileiraPower"), FILEIRA_POWER);
mostrarPino("2");
montarSensores();
montarTour();
montarQuiz();
ultimoQuadro = performance.now();
requestAnimationFrame(quadro);
