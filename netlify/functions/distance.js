const fetch = require("node-fetch");

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DISTANCE_API_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";
const BASE_ADDRESS = "Rua Elizabeth Vicente 132, Butiatuvinha, Curitiba - PR";
const normalizeAddress = (value = "") => value.toString().trim();

exports.handler = async (event) => {
  if (!GOOGLE_API_KEY) {
    return respond(500, { error: "GOOGLE_API_KEY nao configurada." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return respond(400, { error: "Corpo da requisicao invalido." });
  }

  const vehicleAddress = normalizeAddress(body.vehicleAddress);
  const destinationAddress = normalizeAddress(body.destinationAddress);
  const vehicleType = (body.vehicleType || "carro").toString().toLowerCase();

  if (vehicleAddress.length < 5 || destinationAddress.length < 5) {
    return respond(400, {
      error: "Informe os dois enderecos para calcular a distancia.",
    });
  }

  const legs = [
    { origins: BASE_ADDRESS, destinations: vehicleAddress },
    { origins: vehicleAddress, destinations: destinationAddress },
    { origins: destinationAddress, destinations: BASE_ADDRESS },
  ];

  try {
    let totalKm = 0;
    for (const leg of legs) {
      totalKm += await fetchDistanceInKm(leg.origins, leg.destinations);
    }

    const surchargeAmount = getSurchargeAmount();

    return respond(200, {
      distanceKm: totalKm,
      price: calculatePrice(totalKm, vehicleType, surchargeAmount),
    });
  } catch (error) {
    return respond(500, {
      error: error.message || "Falha ao consultar a API do Google.",
    });
  }
};

async function fetchDistanceInKm(origins, destinations) {
  const params = new URLSearchParams({
    units: "metric",
    mode: "driving",
    origins,
    destinations,
    key: GOOGLE_API_KEY,
  });

  const response = await fetch(`${DISTANCE_API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Resposta invalida da API do Google.");
  }

  const data = await response.json();
  if (data.status !== "OK") {
    throw new Error(data.error_message || "A API do Google retornou um erro.");
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new Error(mapElementStatusToMessage(element?.status));
  }

  const distanceMeters = element.distance?.value;
  if (typeof distanceMeters !== "number") {
    throw new Error("Nao foi possivel obter a distancia.");
  }

  return distanceMeters / 1000;
}

function mapElementStatusToMessage(status) {
  switch (status) {
    case "NOT_FOUND":
      return "Endereco invalido ou nao encontrado.";
    case "ZERO_RESULTS":
      return "Nenhuma rota foi encontrada entre os enderecos informados.";
    case "MAX_ROUTE_LENGTH_EXCEEDED":
      return "A distancia excede o limite permitido.";
    default:
      return "A API do Google nao conseguiu calcular a rota.";
  }
}

function calculatePrice(distanceKm, vehicleType, surchargeAmount = 0) {
  const rules = {
    carro: { base: 150, extra: 5 },
    moto: { base: 150, extra: 5 },
    utilitario: { base: 200, extra: 5 },
    pesado: { base: 300, extra: 6 },
    extrap: { base: 350, extra: 6 },
  };

  const { base, extra } = rules[vehicleType] || rules.carro;
  const baseValue = base + surchargeAmount;

  if (distanceKm <= 25) {
    return baseValue;
  }

  return baseValue + (distanceKm - 25) * extra;
}

function getSurchargeAmount(date = new Date()) {
  const { weekday, hour } = getSaoPauloTimeParts(date);
  if (!weekday || typeof hour !== "number" || Number.isNaN(hour)) {
    return 0;
  }

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend) {
    if (hour >= 6 && hour < 22) {
      return 50;
    }
    return 100;
  }

  return hour >= 22 ? 100 : 0;
}

function getSaoPauloTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  let weekday;
  let hour;
  for (const part of parts) {
    if (part.type === "weekday") {
      weekday = part.value;
    } else if (part.type === "hour") {
      hour = Number(part.value);
    }
  }
  return { weekday, hour };
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

